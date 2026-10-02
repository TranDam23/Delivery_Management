import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { checkOrderViewAccess } from "@/lib/order-access";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams { params: Promise<{ id: string }> }

const actionSchema = z.object({ action: z.enum(["transferred", "confirm"]) });

/**
 * POST /api/orders/:id/shipping-payment
 * - transferred: người thanh toán báo đã chuyển khoản VietQR/MoMo (đơn vẫn chờ xác nhận).
 * - confirm: nhân viên xác nhận đã nhận phí. Admin/điều phối xác nhận mọi phương thức;
 *   shipper được phân công chỉ xác nhận tiền mặt mình đã thu.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Hành động không hợp lệ", 400);
  const { id } = await params;

  const supabase = getSupabaseServiceClient();
  const access = await checkOrderViewAccess(supabase, auth, id);
  if (!access.allowed) return fail(access.error, access.status);

  const { data: order, error: orderError } = await supabase.from("orders")
    .select("id, shipping_payment_method, shipping_payment_status, shipping_transferred_at")
    .eq("id", id).maybeSingle();
  if (orderError) return fail(orderError.message, 500);
  if (!order) return fail("Order not found", 404);
  if (!order.shipping_payment_method) return fail("Đơn cũ chưa ghi nhận phương thức thanh toán phí", 409);
  if (order.shipping_payment_status === "paid") return fail("Phí vận chuyển đã được xác nhận thanh toán", 409);
  const isQr = order.shipping_payment_method === "vietqr" || order.shipping_payment_method === "momo";

  if (parsed.data.action === "transferred") {
    if (auth.roleCode !== RoleCode.CUSTOMER || !access.isCustomerParticipant) return fail("Forbidden", 403);
    if (!isQr) return fail("Đơn thanh toán tiền mặt không cần báo chuyển khoản", 409);
    const at = order.shipping_transferred_at ?? new Date().toISOString();
    const { error } = await supabase.from("orders").update({ shipping_transferred_at: at }).eq("id", id).eq("shipping_payment_status", "pending");
    if (error) return fail(error.message, 500);
    return ok({ shipping_transferred_at: at });
  }

  const staffMayConfirm = auth.roleCode === RoleCode.ADMIN || auth.roleCode === RoleCode.DISPATCHER
    || (auth.roleCode === RoleCode.DELIVERY_STAFF && !isQr);
  if (!staffMayConfirm) return fail("Forbidden", 403);
  if (auth.roleCode === RoleCode.DELIVERY_STAFF) {
    const { data: feeOrder, error: feeOrderError } = await supabase.from("orders").select("shipping_fee_payer").eq("id", id).maybeSingle();
    if (feeOrderError) return fail(feeOrderError.message, 500);
    const legType = feeOrder?.shipping_fee_payer === "sender" ? "PICKUP" : feeOrder?.shipping_fee_payer === "receiver" ? "LAST_MILE" : null;
    if (!legType) return fail("Đơn chưa ghi nhận người trả phí", 409);
    const { data: ownLeg, error: ownLegError } = await supabase.from("shipment_legs").select("id")
      .eq("order_id", id).eq("leg_type", legType).eq("is_return", false).eq("assigned_staff_id", auth.userId).limit(1).maybeSingle();
    if (ownLegError) return fail(ownLegError.message, 500);
    if (!ownLeg) return fail(legType === "PICKUP" ? "Phí do người gửi trả, chỉ shipper lấy hàng được xác nhận thu" : "Phí do người nhận trả, chỉ shipper giao hàng được xác nhận thu", 403);
  }
  const paidAt = new Date().toISOString();
  const { data: confirmed, error } = await supabase.from("orders")
    .update({ shipping_payment_status: "paid", shipping_paid_at: paidAt, shipping_paid_by: auth.userId })
    .eq("id", id).eq("shipping_payment_status", "pending").select("id").maybeSingle();
  if (error) return fail(error.message, 500);
  if (!confirmed) return fail("Phí đã được xác nhận bởi người khác. Hãy làm mới trang.", 409);
  await writeAuditLog({ userId: auth.userId, action: "SHIPPING_FEE_CONFIRMED", entityType: "order", entityId: id, oldData: { shipping_payment_status: "pending" }, newData: { shipping_payment_status: "paid", method: order.shipping_payment_method }, request });
  return ok({ shipping_payment_status: "paid", shipping_paid_at: paidAt });
}
