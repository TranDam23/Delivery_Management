import type { NextRequest } from "next/server";
import { RoleCode } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DISPATCHER) return fail("Forbidden", 403);
  const { orderId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) return fail("Mã đơn không hợp lệ.");

  const db = getSupabaseServiceClient();
  const { data: order, error: orderError } = await db.from("orders")
    .select("id, tracking_code, pickup_warehouse_id, delivery_warehouse_id")
    .eq("id", orderId).maybeSingle();
  if (orderError) return fail("Không tải được đơn hàng.", 503);
  if (!order) return fail("Không tìm thấy đơn hàng.", 404);
  if (auth.roleCode === RoleCode.DISPATCHER) {
    const { data: user, error: userError } = await db.from("users")
      .select("warehouse_id, status").eq("id", auth.userId).maybeSingle();
    if (userError) return fail("Không kiểm tra được quyền truy cập.", 503);
    if (!user || user.status !== "active" || !user.warehouse_id ||
      ![order.pickup_warehouse_id, order.delivery_warehouse_id].includes(user.warehouse_id)) {
      return fail("Đơn hàng không thuộc kho của bạn.", 403);
    }
  }

  const [feedbackResult, alertResult] = await Promise.all([
    db.from("order_feedback").select("id, kind, rating, message, created_at")
      .eq("order_id", orderId).order("created_at", { ascending: false }),
    db.from("alerts").select("id, status, detected_at, resolved_at")
      .eq("order_id", orderId).eq("alert_type", "CUSTOMER_COMPLAINT")
      .order("detected_at", { ascending: false }),
  ]);
  if (feedbackResult.error || alertResult.error) return fail("Không tải được phản hồi.", 503);
  const response = ok({ order: { trackingCode: order.tracking_code }, feedback: feedbackResult.data ?? [], alerts: alertResult.data ?? [] });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
