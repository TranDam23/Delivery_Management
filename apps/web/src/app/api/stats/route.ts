import type { NextRequest } from "next/server";
import { OrderStatusCode, RoleCode } from "@delivery/shared";
import { scanAlertsIfDue } from "@/lib/alert-scanner";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { relationValue } from "@/lib/order-ui";
import { scopedOrderIds } from "@/lib/order-scope";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { estimateDeliveryDate, routeZone, type ZoneWarehouse } from "@/lib/tracking-estimate";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const ORDER_BATCH_SIZE = 1000;
const SCOPE_ID_BATCH_SIZE = 150;

interface StatsOrder {
  id: string;
  created_at: string;
  service_type: string;
  expected_delivery_date: string | null;
  order_statuses: { code: string; is_final: boolean } | { code: string; is_final: boolean }[] | null;
  pickup_warehouse: ZoneWarehouse | ZoneWarehouse[] | null;
  delivery_warehouse: ZoneWarehouse | ZoneWarehouse[] | null;
}

interface DeliveryOutcomeEvent {
  id: string;
  order_id: string;
  event_time: string;
  order_statuses: { code: string } | { code: string }[] | null;
  deliveries: { is_return: boolean } | { is_return: boolean }[] | null;
}

interface DeliveryOutcomeCounts {
  delivered: number;
  failed: number;
  returned: number;
}

export interface StatsBucket {
  key: string;
  created: number;
  delivered: number;
  failed: number;
  returned: number;
  late: number;
}

function bucketKey(iso: string, period: "day" | "month"): string {
  const local = new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString();
  return period === "day" ? local.slice(0, 10) : local.slice(0, 7);
}

function parseDateOnly(value: string | null): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? new Date(`${value}T00:00:00.000+07:00`)
    : undefined;
}

/** Danh sách khoá thời gian liên tục để biểu đồ không bị hổng ngày/tháng không có đơn. */
function bucketKeys(from: Date, to: Date, period: "day" | "month"): string[] {
  const start = new Date(from.getTime() + VN_OFFSET_MS);
  const end = new Date(to.getTime() + VN_OFFSET_MS);
  const cursor = period === "day"
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
    : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const keys: string[] = [];
  while (cursor.getTime() <= end.getTime() && keys.length < 900) {
    keys.push(cursor.toISOString().slice(0, period === "day" ? 10 : 7));
    if (period === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

async function fetchDeliveryOutcomeCounts(
  db: ReturnType<typeof getSupabaseServiceClient>,
  scopeIds: string[] | null,
  from: Date,
  to: Date,
): Promise<{ counts: DeliveryOutcomeCounts; error: string | null }> {
  const latestByOrder = new Map<string, "delivered" | "failed" | "returned">();
  const select = "id, order_id, event_time, order_statuses!delivery_events_status_id_fkey(code), deliveries!inner(is_return)";
  const consume = (rows: unknown[]) => {
    for (const row of rows as DeliveryOutcomeEvent[]) {
      const status = relationValue(row.order_statuses);
      const delivery = relationValue(row.deliveries);
      if (!delivery || !status) continue;
      const outcome = status.code === OrderStatusCode.DELIVERED && !delivery.is_return
        ? "delivered"
        : status.code === OrderStatusCode.DELIVERY_FAILED && !delivery.is_return
          ? "failed"
          : status.code === OrderStatusCode.RETURNED && delivery.is_return
            ? "returned"
            : null;
      if (outcome) latestByOrder.set(row.order_id, outcome);
    }
  };

  const query = async (orderIds?: string[]) => {
    for (let fromRow = 0; ; fromRow += ORDER_BATCH_SIZE) {
      let request = db.from("delivery_events").select(select)
        .gte("event_time", from.toISOString()).lte("event_time", to.toISOString())
        .order("event_time", { ascending: true }).order("id", { ascending: true })
        .range(fromRow, fromRow + ORDER_BATCH_SIZE - 1);
      if (orderIds) request = request.in("order_id", orderIds);
      const { data, error } = await request;
      if (error) return error.message;
      const batch = data ?? [];
      consume(batch);
      if (batch.length < ORDER_BATCH_SIZE) return null;
    }
  };

  if (scopeIds === null) {
    const error = await query();
    if (error) return { counts: { delivered: 0, failed: 0, returned: 0 }, error };
  } else {
    for (let index = 0; index < scopeIds.length; index += SCOPE_ID_BATCH_SIZE) {
      const error = await query(scopeIds.slice(index, index + SCOPE_ID_BATCH_SIZE));
      if (error) return { counts: { delivered: 0, failed: 0, returned: 0 }, error };
    }
  }

  const counts = { delivered: 0, failed: 0, returned: 0 };
  for (const outcome of latestByOrder.values()) counts[outcome] += 1;
  return { counts, error: null };
}

/**
 * GET /api/stats?period=day|month&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Thống kê trong phạm vi đơn mà tài khoản được xem: tổng đơn, theo trạng thái,
 * tỷ lệ giao thành công, đơn trễ hạn (theo mốc giao dự kiến) và chuỗi theo ngày/tháng.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  const params = request.nextUrl.searchParams;
  const period = params.get("period") === "month" ? "month" : "day";

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - (period === "day" ? 29 : 365) * 24 * 60 * 60 * 1000);
  const fromParam = params.get("from");
  const toParam = params.get("to");
  if (fromParam && !parseDateOnly(fromParam)) return fail("Ngày bắt đầu không hợp lệ", 400);
  if (toParam && !parseDateOnly(toParam)) return fail("Ngày kết thúc không hợp lệ", 400);
  const from = fromParam ? parseDateOnly(fromParam)! : defaultFrom;
  const to = toParam ? new Date(`${toParam}T23:59:59.999+07:00`) : now;
  if (from.getTime() > to.getTime()) return fail("Khoảng thời gian không hợp lệ", 400);
  if (to.getTime() - from.getTime() > 800 * 24 * 60 * 60 * 1000) return fail("Khoảng thống kê tối đa 800 ngày", 400);

  const scope = await scopedOrderIds(auth);
  if (scope.error) return fail(scope.error, scope.error === "Forbidden" ? 403 : 500);

  if (auth.roleCode === RoleCode.ADMIN || auth.roleCode === RoleCode.DISPATCHER) {
    try { await scanAlertsIfDue(); } catch (error) { console.error("Quét cảnh báo thất bại", error); }
  }

  const db = getSupabaseServiceClient();
  const select = `id, created_at, service_type, expected_delivery_date,
    order_statuses!inner(code, is_final),
    pickup_warehouse:warehouses!orders_pickup_warehouse_id_fkey(province, region_code),
    delivery_warehouse:warehouses!orders_delivery_warehouse_id_fkey(province, region_code)`;
  const orders: StatsOrder[] = [];
  let currentInProgressOrders = 0;
  const { data: statuses, error: statusesError } = await db.from("order_statuses").select("id, is_final");
  if (statusesError) return fail(statusesError.message, 500);
  const inProgressStatusIds = (statuses ?? []).filter((status) => !status.is_final).map((status) => status.id);
  if (inProgressStatusIds.length) {
    if (scope.ids === null) {
      const { count, error } = await db.from("orders").select("id", { count: "exact", head: true }).in("status_id", inProgressStatusIds);
      if (error) return fail(error.message, 500);
      currentInProgressOrders = count ?? 0;
    } else {
      for (let index = 0; index < scope.ids.length; index += SCOPE_ID_BATCH_SIZE) {
        const { count, error } = await db.from("orders").select("id", { count: "exact", head: true })
          .in("id", scope.ids.slice(index, index + SCOPE_ID_BATCH_SIZE)).in("status_id", inProgressStatusIds);
        if (error) return fail(error.message, 500);
        currentInProgressOrders += count ?? 0;
      }
    }
  }
  if (scope.ids === null) {
    for (let fromRow = 0; ; fromRow += ORDER_BATCH_SIZE) {
      const { data, error } = await db.from("orders").select(select)
        .gte("created_at", from.toISOString()).lte("created_at", to.toISOString())
        .order("created_at", { ascending: true }).order("id", { ascending: true })
        .range(fromRow, fromRow + ORDER_BATCH_SIZE - 1);
      if (error) return fail(error.message, 500);
      const batch = data ?? [];
      orders.push(...(batch as unknown as StatsOrder[]));
      if (batch.length < ORDER_BATCH_SIZE) break;
    }
  } else {
    for (let index = 0; index < scope.ids.length; index += SCOPE_ID_BATCH_SIZE) {
      const { data, error } = await db.from("orders").select(select)
        .in("id", scope.ids.slice(index, index + SCOPE_ID_BATCH_SIZE))
        .gte("created_at", from.toISOString()).lte("created_at", to.toISOString());
      if (error) return fail(error.message, 500);
      orders.push(...((data ?? []) as unknown as StatsOrder[]));
    }
  }

  const eventResults = await fetchDeliveryOutcomeCounts(db, scope.ids, from, to);
  if (eventResults.error) return fail(eventResults.error, 500);
  const eventFinished = eventResults.counts.delivered + eventResults.counts.failed + eventResults.counts.returned;

  const buckets = new Map<string, StatsBucket>(bucketKeys(from, to, period).map((key) => [key, { key, created: 0, delivered: 0, failed: 0, returned: 0, late: 0 }]));
  const byStatus: Record<string, number> = {};
  let delivered = 0;
  let failed = 0;
  let returned = 0;
  let cancelled = 0;
  let late = 0;

  for (const order of orders) {
    const status = relationValue(order.order_statuses);
    const code = status?.code ?? "UNKNOWN";
    byStatus[code] = (byStatus[code] ?? 0) + 1;
    const bucket = buckets.get(bucketKey(order.created_at, period)) ?? { key: bucketKey(order.created_at, period), created: 0, delivered: 0, failed: 0, returned: 0, late: 0 };
    buckets.set(bucket.key, bucket);
    bucket.created += 1;

    if (code === OrderStatusCode.DELIVERED) { delivered += 1; bucket.delivered += 1; }
    else if (code === OrderStatusCode.DELIVERY_FAILED) { failed += 1; bucket.failed += 1; }
    else if (code === OrderStatusCode.RETURNED) { returned += 1; bucket.returned += 1; }
    else if (code === OrderStatusCode.CANCELLED) cancelled += 1;

    if (status && !status.is_final) {
      const zone = routeZone(relationValue(order.pickup_warehouse), relationValue(order.delivery_warehouse));
      const eta = estimateDeliveryDate(order.created_at, order.service_type, order.expected_delivery_date, zone).date;
      if (eta && Date.parse(eta) < now.getTime()) { late += 1; bucket.late += 1; }
    }
  }

  const total = orders.length;
  const finished = delivered + failed + returned;
  const body: Record<string, unknown> = {
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    truncated: false,
    totalOrders: total,
    inProgressOrders: currentInProgressOrders,
    deliveredOrders: delivered,
    failedOrders: failed,
    returnedOrders: returned,
    cancelledOrders: cancelled,
    lateOrders: late,
    successRate: total > 0 ? Number(((delivered / total) * 100).toFixed(2)) : 0,
    completionSuccessRate: finished > 0 ? Number(((delivered / finished) * 100).toFixed(2)) : 0,
    deliveredEventsInPeriod: eventResults.counts.delivered,
    failedEventsInPeriod: eventResults.counts.failed,
    returnedEventsInPeriod: eventResults.counts.returned,
    eventSuccessRate: eventFinished > 0 ? Number(((eventResults.counts.delivered / eventFinished) * 100).toFixed(2)) : 0,
    eventFailureRate: eventFinished > 0 ? Number(((eventResults.counts.failed / eventFinished) * 100).toFixed(2)) : 0,
    byStatus,
    series: Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key)),
  };

  if (auth.roleCode === RoleCode.ADMIN) {
    const [users, alerts] = await Promise.all([
      db.from("users").select("id", { count: "exact", head: true }).eq("status", "active"),
      db.from("alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);
    if (users.error || alerts.error) {
      console.error("Lấy thống kê hệ thống thất bại", users.error?.code, alerts.error?.code);
      return fail("Không thể tải thống kê hệ thống", 500);
    }
    let codAwaitingReconciliation = 0;
    for (let fromRow = 0; ; fromRow += ORDER_BATCH_SIZE) {
      const { data, error } = await db.from("cod_transactions")
        .select("id, amount")
        .eq("status", "collected")
        .order("id", { ascending: true })
        .range(fromRow, fromRow + ORDER_BATCH_SIZE - 1);
      if (error) {
        console.error("Lấy thống kê COD thất bại", error.code);
        return fail("Không thể tải thống kê hệ thống", 500);
      }
      const batch = data ?? [];
      codAwaitingReconciliation += batch.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      if (batch.length < ORDER_BATCH_SIZE) break;
    }
    body.system = {
      activeUsers: users.count ?? 0,
      openAlerts: alerts.count ?? 0,
      codAwaitingReconciliation,
    };
  } else if (auth.roleCode === RoleCode.DISPATCHER) {
    let openAlerts = 0;
    for (let index = 0; index < (scope.ids ?? []).length; index += SCOPE_ID_BATCH_SIZE) {
      const { count, error } = await db.from("alerts").select("id", { count: "exact", head: true })
        .eq("status", "open").in("order_id", scope.ids!.slice(index, index + SCOPE_ID_BATCH_SIZE));
      if (error) return fail(error.message, 500);
      openAlerts += count ?? 0;
    }
    body.system = { openAlerts };
  }

  return ok(body);
}
