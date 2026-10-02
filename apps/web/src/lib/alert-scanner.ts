import { OrderStatusCode } from "@delivery/shared";
import { relationValue } from "@/lib/order-ui";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { estimateDeliveryDate, routeZone, type ZoneWarehouse } from "@/lib/tracking-estimate";

export const ALERT_TYPE = {
  LATE: "DELIVERY_LATE",
  STUCK: "STUCK_STATUS",
  INVALID_FLOW: "INVALID_STATUS_FLOW",
} as const;

export interface AlertScanResult {
  scanned: number;
  late: number;
  stuck: number;
  invalidFlow: number;
  resolved: number;
}

interface ScanOrder {
  id: string;
  tracking_code: string;
  service_type: string;
  created_at: string;
  updated_at: string;
  expected_delivery_date: string | null;
  order_statuses: { code: string; name: string } | { code: string; name: string }[] | null;
  pickup_warehouse: ZoneWarehouse | ZoneWarehouse[] | null;
  delivery_warehouse: ZoneWarehouse | ZoneWarehouse[] | null;
}

const FINAL_STATUS_CODES: string[] = [OrderStatusCode.DELIVERED, OrderStatusCode.RETURNED, OrderStatusCode.CANCELLED];
const MAX_ORDERS_PER_SCAN = 3000;
const INVALID_FLOW_WINDOW_DAYS = 14;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function numberSetting(key: string, fallback: number): Promise<number> {
  const { data } = await getSupabaseServiceClient().from("system_settings").select("value").eq("key", key).maybeSingle();
  const value = Number(data?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Quét các đơn chưa kết thúc và sinh cảnh báo vận hành, mỗi đơn tối đa một cảnh báo
 * còn mở cho mỗi loại. Cảnh báo trễ/kẹt tự đóng khi đơn đã kết thúc.
 */
export async function scanOperationalAlerts(now = new Date()): Promise<AlertScanResult> {
  const db = getSupabaseServiceClient();
  const result: AlertScanResult = { scanned: 0, late: 0, stuck: 0, invalidFlow: 0, resolved: 0 };
  const stuckHours = await numberSetting("STUCK_STATUS_HOURS", 24);

  const { data: orderRows, error } = await db.from("orders")
    .select(`id, tracking_code, service_type, created_at, updated_at, expected_delivery_date,
      order_statuses!inner(code, name, is_final),
      pickup_warehouse:warehouses!orders_pickup_warehouse_id_fkey(province, region_code),
      delivery_warehouse:warehouses!orders_delivery_warehouse_id_fkey(province, region_code)`)
    .eq("order_statuses.is_final", false)
    .order("created_at", { ascending: true })
    .limit(MAX_ORDERS_PER_SCAN);
  if (error) throw new Error(error.message);
  const orders = (orderRows ?? []) as unknown as ScanOrder[];
  result.scanned = orders.length;

  const wanted: Array<{ order_id: string; alert_type: string; title: string; message: string; details: Record<string, unknown> }> = [];

  // 1) Đơn quá thời gian giao dự kiến.
  for (const order of orders) {
    const zone = routeZone(relationValue(order.pickup_warehouse), relationValue(order.delivery_warehouse));
    const eta = estimateDeliveryDate(order.created_at, order.service_type, order.expected_delivery_date, zone).date;
    if (eta && Date.parse(eta) < now.getTime()) {
      wanted.push({
        order_id: order.id,
        alert_type: ALERT_TYPE.LATE,
        title: `Đơn ${order.tracking_code} trễ hạn giao`,
        message: `Đơn ${order.tracking_code} đã quá thời gian giao dự kiến (${new Date(eta).toLocaleString("vi-VN")}) nhưng chưa hoàn tất.`,
        details: { expectedDeliveryDate: eta, zone, status: relationValue(order.order_statuses)?.code ?? null },
      });
    }
  }

  // 2) Đơn bị giữ ở một trạng thái quá lâu: không có cập nhật nào trong N giờ.
  const staleBefore = now.getTime() - stuckHours * 60 * 60 * 1000;
  const staleOrders = orders.filter((order) => Date.parse(order.updated_at) < staleBefore);
  const lastActivity = new Map<string, number>();
  for (const group of chunk(staleOrders.map((order) => order.id), 150)) {
    const [delivery, warehouse] = await Promise.all([
      db.from("delivery_events").select("order_id, event_time").in("order_id", group).gte("event_time", new Date(staleBefore).toISOString()),
      db.from("warehouse_events").select("order_id, event_time").in("order_id", group).gte("event_time", new Date(staleBefore).toISOString()),
    ]);
    if (delivery.error) throw new Error(delivery.error.message);
    if (warehouse.error) throw new Error(warehouse.error.message);
    for (const row of [...(delivery.data ?? []), ...(warehouse.data ?? [])]) {
      lastActivity.set(row.order_id, Math.max(lastActivity.get(row.order_id) ?? 0, Date.parse(row.event_time)));
    }
  }
  for (const order of staleOrders) {
    if (lastActivity.has(order.id)) continue;
    const status = relationValue(order.order_statuses);
    wanted.push({
      order_id: order.id,
      alert_type: ALERT_TYPE.STUCK,
      title: `Đơn ${order.tracking_code} bị giữ quá lâu`,
      message: `Đơn ${order.tracking_code} ở trạng thái "${status?.name ?? status?.code ?? "không rõ"}" hơn ${stuckHours} giờ mà chưa có cập nhật mới.`,
      details: { status: status?.code ?? null, since: order.updated_at, thresholdHours: stuckHours },
    });
  }

  // 3) Luồng trạng thái không hợp lệ: có sự kiện giao nhận sau khi đơn đã kết thúc.
  const since = new Date(now.getTime() - INVALID_FLOW_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentEvents, error: eventsError } = await db.from("delivery_events")
    .select("order_id, event_time, order_statuses!delivery_events_status_id_fkey(code, name), orders(tracking_code)")
    .gte("event_time", since).order("event_time", { ascending: true }).limit(10000);
  if (eventsError) throw new Error(eventsError.message);
  const finishedAt = new Map<string, { code: string; time: string }>();
  const flagged = new Set<string>();
  for (const event of (recentEvents ?? []) as unknown as Array<{ order_id: string; event_time: string; order_statuses: { code: string; name: string } | { code: string; name: string }[] | null; orders: { tracking_code: string } | { tracking_code: string }[] | null }>) {
    const code = relationValue(event.order_statuses)?.code ?? "";
    const finished = finishedAt.get(event.order_id);
    if (finished && !flagged.has(event.order_id)) {
      flagged.add(event.order_id);
      const tracking = relationValue(event.orders)?.tracking_code ?? event.order_id;
      wanted.push({
        order_id: event.order_id,
        alert_type: ALERT_TYPE.INVALID_FLOW,
        title: `Đơn ${tracking} có trạng thái bất thường`,
        message: `Đơn ${tracking} đã kết thúc ở trạng thái ${finished.code} nhưng vẫn phát sinh sự kiện ${code} sau đó.`,
        details: { finalStatus: finished.code, finalAt: finished.time, unexpectedStatus: code, unexpectedAt: event.event_time },
      });
    }
    if (!finished && FINAL_STATUS_CODES.includes(code)) finishedAt.set(event.order_id, { code, time: event.event_time });
  }

  // Bỏ cảnh báo đã tồn tại (còn mở) rồi ghi các cảnh báo mới.
  const existing = new Set<string>();
  for (const group of chunk(Array.from(new Set(wanted.map((alert) => alert.order_id))), 150)) {
    const { data: open, error: openError } = await db.from("alerts").select("order_id, alert_type")
      .in("order_id", group).in("status", ["open", "acknowledged"]);
    if (openError) throw new Error(openError.message);
    for (const row of open ?? []) existing.add(`${row.order_id}:${row.alert_type}`);
  }
  for (const alert of wanted) {
    if (existing.has(`${alert.order_id}:${alert.alert_type}`)) continue;
    const { error: insertError } = await db.from("alerts").insert({ ...alert, details: alert.details as never });
    if (insertError) {
      if (insertError.code === "23505") continue;
      throw new Error(insertError.message);
    }
    if (alert.alert_type === ALERT_TYPE.LATE) result.late += 1;
    else if (alert.alert_type === ALERT_TYPE.STUCK) result.stuck += 1;
    else result.invalidFlow += 1;
  }

  // Tự đóng cảnh báo trễ/kẹt khi đơn đã kết thúc.
  const { data: openAlerts, error: openAlertsError } = await db.from("alerts")
    .select("id, orders!inner(order_statuses!inner(is_final))")
    .in("alert_type", [ALERT_TYPE.LATE, ALERT_TYPE.STUCK]).eq("status", "open")
    .eq("orders.order_statuses.is_final", true).limit(500);
  if (openAlertsError) throw new Error(openAlertsError.message);
  const resolvedIds = (openAlerts ?? []).map((row) => row.id);
  if (resolvedIds.length > 0) {
    const { error: resolveError } = await db.from("alerts")
      .update({ status: "resolved", resolved_at: now.toISOString() }).in("id", resolvedIds);
    if (resolveError) throw new Error(resolveError.message);
    result.resolved = resolvedIds.length;
  }
  return result;
}

/** Quét lười biếng khi người dùng vận hành mở trang; tránh quét lại trong khoảng ngắn. */
export async function scanAlertsIfDue(): Promise<AlertScanResult | null> {
  const db = getSupabaseServiceClient();
  const intervalMinutes = await numberSetting("ALERT_SCAN_INTERVAL_MINUTES", 10);
  const { data: last } = await db.from("system_settings").select("value").eq("key", "ALERT_LAST_SCAN").maybeSingle();
  const lastTime = Date.parse(last?.value ?? "");
  if (Number.isFinite(lastTime) && Date.now() - lastTime < intervalMinutes * 60 * 1000) return null;
  // Giữ chỗ trước khi quét để các request đồng thời không quét trùng.
  const { error } = await db.from("system_settings").upsert(
    { key: "ALERT_LAST_SCAN", value: new Date().toISOString(), description: "Lần quét cảnh báo tự động gần nhất" },
    { onConflict: "key" },
  );
  if (error) return null;
  return scanOperationalAlerts();
}
