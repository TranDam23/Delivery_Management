import type { NextRequest } from "next/server";
import { RoleCode } from "@delivery/shared";
import { scanAlertsIfDue } from "@/lib/alert-scanner";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { scopedOrderIds } from "@/lib/order-scope";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const STATUSES = new Set(["open", "acknowledged", "resolved", "dismissed"]);

/** GET /api/alerts — cảnh báo vận hành trong phạm vi của Admin/điều phối viên. */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DISPATCHER) return fail("Forbidden", 403);

  try {
    await scanAlertsIfDue();
  } catch (error) {
    console.error("Quét cảnh báo thất bại", error);
  }

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const pageSize = 20;
  const status = request.nextUrl.searchParams.get("status") ?? "open";
  const type = request.nextUrl.searchParams.get("type");
  const scope = await scopedOrderIds(auth);
  if (scope.error) return fail(scope.error, 500);
  if (scope.ids !== null && scope.ids.length === 0) return ok({ items: [], total: 0, page, pageSize });

  let query = getSupabaseServiceClient().from("alerts")
    .select("id, order_id, alert_type, title, message, details, detected_at, status, resolved_at, orders(tracking_code)", { count: "exact" })
    .order("detected_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (status !== "all") query = query.eq("status", STATUSES.has(status) ? status : "open");
  if (type) query = query.eq("alert_type", type);
  if (scope.ids !== null) query = query.in("order_id", scope.ids);
  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);
  return ok({ items: data ?? [], total: count ?? 0, page, pageSize });
}
