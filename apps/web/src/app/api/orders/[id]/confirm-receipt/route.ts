import type { NextRequest } from "next/server";
import { z } from "zod";
import { BlockchainEventType, normalizePhone, OrderStatusCode, RoleCode, ShipmentLegType } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { queueBlockchainEvent } from "@/lib/blockchain/queue-event";
import { fail, ok } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const confirmReceiptSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

interface Participant {
  phone: string;
}

interface OrderConfirmationData {
  id: string;
  tracking_code: string;
  receiver: Participant | Participant[] | null;
  order_statuses: { code: string } | { code: string }[] | null;
}

/** POST /api/orders/:id/confirm-receipt — người nhận xác nhận đã nhận hàng. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.CUSTOMER && auth.roleCode !== RoleCode.ADMIN) {
    return fail("Chỉ người nhận mới được xác nhận đã nhận hàng", 403);
  }

  const parsed = confirmReceiptSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const { id: orderId } = await params;
  const supabase = getSupabaseServiceClient();
  const { data: orderRaw, error: orderError } = await supabase
    .from("orders")
    .select("id, tracking_code, receiver:contacts!orders_receiver_id_fkey(phone), order_statuses(code)")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) return fail(orderError.message, 500);
  if (!orderRaw) return fail("Order not found", 404);

  const order = orderRaw as OrderConfirmationData;
  const receiver = Array.isArray(order.receiver) ? order.receiver[0] ?? null : order.receiver;
  const status = Array.isArray(order.order_statuses) ? order.order_statuses[0] ?? null : order.order_statuses;
  if (status?.code !== OrderStatusCode.DELIVERED) {
    return fail("Chỉ có thể xác nhận sau khi đơn hàng được cập nhật đã giao thành công", 409);
  }

  if (auth.roleCode !== RoleCode.ADMIN) {
    const { data: viewer, error: viewerError } = await supabase
      .from("users")
      .select("phone")
      .eq("id", auth.userId)
      .maybeSingle();
    if (viewerError) return fail(viewerError.message, 500);
    const viewerPhone = normalizePhone(typeof viewer?.phone === "string" ? viewer.phone : "");
    // contact.user_id is the address-book owner, not the recipient account.
    const isReceiver = viewerPhone.length > 0 && normalizePhone(receiver?.phone ?? "") === viewerPhone;
    if (!isReceiver) return fail("Tài khoản không phải người nhận của đơn hàng", 403);
  }

  const { data: lastMileLeg, error: legError } = await supabase
    .from("shipment_legs")
    .select("id")
    .eq("order_id", orderId)
    .eq("leg_type", ShipmentLegType.LAST_MILE)
    .eq("is_return", false)
    .order("sequence_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (legError) return fail(legError.message, 500);
  if (!lastMileLeg) return fail("Đơn hàng chưa có chặng giao cuối", 409);

  const { data: delivery, error: deliveryError } = await supabase
    .from("deliveries")
    .select("id, received_at")
    .eq("shipment_leg_id", lastMileLeg.id)
    .maybeSingle();
  if (deliveryError) return fail(deliveryError.message, 500);
  if (!delivery) return fail("Chặng giao cuối chưa có bản ghi giao nhận", 409);
  if (delivery.received_at) return ok({ confirmed_at: delivery.received_at, already_confirmed: true });

  const confirmedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("deliveries")
    .update({ received_at: confirmedAt })
    .eq("id", delivery.id)
    .is("received_at", null);
  if (updateError) return fail(updateError.message, 500);

  const { error: auditError } = await supabase.from("audit_logs").insert({
    user_id: auth.userId,
    action: "RECEIVER_CONFIRMED",
    entity_type: "orders",
    entity_id: orderId,
    old_data: { received_at: null },
    new_data: { received_at: confirmedAt, note: parsed.data.note ?? null },
  });
  if (auditError) return fail(auditError.message, 500);

  await queueBlockchainEvent({
    orderId,
    trackingCode: order.tracking_code,
    eventType: BlockchainEventType.RECEIVER_CONFIRMED,
    performedBy: auth.userId,
    payload: { deliveryId: delivery.id, confirmedAt, note: parsed.data.note ?? null },
  });

  return ok({ confirmed_at: confirmedAt, already_confirmed: false });
}
