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
const MAX_ORDERS = 20000;

interface StatsOrder {
  id: string;
  created_at: string;
  service_type: string;
  expected_delivery_date: string | null;
  order_statuses: { code: string; is_final: boolean } | { code: string; is_final: boolean }[] | null;
  pickup_warehouse: ZoneWarehouse | ZoneWarehouse[] | null;
  delivery_warehouse: ZoneWarehouse | ZoneWarehouse[] | null;
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
  const from = fromParam && !Number.isNaN(Date.parse(fromParam)) ? new Date(`${fromParam}T00:00:00.000+07:00`) : defaultFrom;
  const to = toParam && !Number.isNaN(Date.parse(toParam)) ? new Date(`${toParam}T23:59:59.999+07:00`) : now;
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
  if (scope.ids === null) {
    const { data, error } = await db.from("orders").select(select)
      .gte("created_at", from.toISOString()).lte("created_at", to.toISOString()).limit(MAX_ORDERS);
    if (error) return fail(error.message, 500);
    orders.push(...((data ?? []) as unknown as StatsOrder[]));
  } else {
    for (let index = 0; index < scope.ids.length; index += 150) {
      const { data, error } = await db.from("orders").select(select)
        .in("id", scope.ids.slice(index, index + 150))
        .gte("created_at", from.toISOString()).lte("created_at", to.toISOString());
      if (error) return fail(error.message, 500);
      orders.push(...((data ?? []) as unknown as StatsOrder[]));
    }
  }

  const buckets = new Map<string, StatsBucket>(bucketKeys(from, to, period).map((key) => [key, { key, created: 0, delivered: 0, failed: 0, returned: 0, late: 0 }]));
  const byStatus: Record<string, number> = {};
  let delivered = 0;
  let failed = 0;
  let returned = 0;
  let cancelled = 0;
  let inProgress = 0;
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
    else if (code === OrderStatusCode.RETURNING || code === OrderStatusCode.RETURNED) { returned += 1; bucket.returned += 1; }
    else if (code === OrderStatusCode.CANCELLED) cancelled += 1;
    else inProgress += 1;

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
    truncated: scope.ids === null && total >= MAX_ORDERS,
    totalOrders: total,
    inProgressOrders: inProgress,
    deliveredOrders: delivered,
    failedOrders: failed,
    returnedOrders: returned,
    cancelledOrders: cancelled,
    lateOrders: late,
    successRate: total > 0 ? Number(((delivered / total) * 100).toFixed(2)) : 0,
    completionSuccessRate: finished > 0 ? Number(((delivered / finished) * 100).toFixed(2)) : 0,
    byStatus,
    series: Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key)),
  };

  if (auth.roleCode === RoleCode.ADMIN) {
    const [users, alerts, cod] = await Promise.all([
      db.from("users").select("id", { count: "exact", head: true }).eq("status", "active"),
      db.from("alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
      db.from("cod_transactions").select("amount").eq("status", "collected"),
    ]);
    body.system = {
      activeUsers: users.count ?? 0,
      openAlerts: alerts.count ?? 0,
      codAwaitingReconciliation: (cod.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    };
  } else if (auth.roleCode === RoleCode.DISPATCHER) {
    const { count } = scope.ids && scope.ids.length > 0
      ? await db.from("alerts").select("id", { count: "exact", head: true }).eq("status", "open").in("order_id", scope.ids.slice(0, 500))
      : { count: 0 };
    body.system = { openAlerts: count ?? 0 };
  }

  return ok(body);
}
