import type { NextRequest } from "next/server";
import { OrderStatusCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";

/**
 * GET /api/stats — thong ke so luong don, ty le giao thanh cong, don hoan,
 * don tre han (dung SUPABASE_DB_PASSWORD/system_settings.DELIVERY_SLA_HOURS).
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const supabase = getSupabaseServiceClient();

  const { count: totalOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true });

  const { count: deliveredOrders } = await supabase
    .from("orders")
    .select("id, order_statuses!inner(code)", { count: "exact", head: true })
    .eq("order_statuses.code", OrderStatusCode.DELIVERED);

  const { count: returnedOrders } = await supabase
    .from("orders")
    .select("id, order_statuses!inner(code)", { count: "exact", head: true })
    .eq("order_statuses.code", OrderStatusCode.RETURNED);

  const { data: slaSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "DELIVERY_SLA_HOURS")
    .maybeSingle();
  const slaHours = Number(slaSetting?.value ?? 48);
  const slaThreshold = new Date(Date.now() - slaHours * 60 * 60 * 1000).toISOString();

  const { count: lateOrders } = await supabase
    .from("orders")
    .select("id, order_statuses!inner(code, is_final)", { count: "exact", head: true })
    .eq("order_statuses.is_final", false)
    .lt("created_at", slaThreshold);

  const total = totalOrders ?? 0;
  const delivered = deliveredOrders ?? 0;

  return ok({
    totalOrders: total,
    deliveredOrders: delivered,
    returnedOrders: returnedOrders ?? 0,
    lateOrders: lateOrders ?? 0,
    successRate: total > 0 ? Number(((delivered / total) * 100).toFixed(2)) : 0,
  });
}
