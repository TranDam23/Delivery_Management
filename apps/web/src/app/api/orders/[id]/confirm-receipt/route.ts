import type { NextRequest } from "next/server";
import { z } from "zod";
import { BlockchainEventType, OrderStatusCode, RoleCode, ShipmentLegType } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { dispatchBlockchainEvent, isBlockchainWriteEnabled } from "@/lib/blockchain/queue-event";
import { hashEventPayload } from "@/lib/blockchain/record-event";
import { fail, ok } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { checkOrderViewAccess } from "@/lib/order-access";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const confirmReceiptSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

interface OrderConfirmationData {
  id: string;
  tracking_code: string;
  order_statuses: { code: string } | { code: string }[] | null;
}

const confirmationResultSchema = z.object({
  status: z.enum(["confirmed", "already_confirmed"]),
  confirmed_at: z.string().datetime({ offset: true }),
  event_id: z.string().uuid().nullable(),
});

const blockchainEventSchema = z.object({
  id: z.string().uuid(),
  event_data_hash: z.string(),
  event_payload: z.record(z.string(), z.unknown()).nullable(),
  performed_by: z.string().uuid().nullable(),
  tx_status: z.string(),
});

/** POST /api/orders/:id/confirm-receipt — người nhận xác nhận đã nhận hàng. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.CUSTOMER && auth.roleCode !== RoleCode.ADMIN) {
    return fail("Chỉ người nhận mới được xác nhận đã nhận hàng", 403);
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return fail("Dữ liệu xác nhận nhận hàng không hợp lệ", 400);
  }
  const parsed = confirmReceiptSchema.safeParse(requestBody);
  if (!parsed.success) return fail(parsed.error.message);

  const parsedOrderId = z.string().uuid().safeParse((await params).id);
  if (!parsedOrderId.success) return fail("Mã đơn hàng không hợp lệ.", 400);
  const orderId = parsedOrderId.data.toLowerCase();
  const supabase = getSupabaseServiceClient();
  const access = await checkOrderViewAccess(supabase, auth, orderId);
  if (!access.allowed) {
    if (access.status >= 500) {
      console.error("Checking receipt confirmation access failed", { orderId, error: access.error });
      return fail("Không thể kiểm tra quyền xác nhận nhận hàng.", 500);
    }
    return fail(access.error, access.status);
  }
  if (!access.canConfirmReceipt) return fail("Tài khoản không được xác nhận nhận hàng cho đơn này", 403);

  const { data: orderRaw, error: orderError } = await supabase
    .from("orders")
    .select("id, tracking_code, order_statuses(code)")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    console.error("Loading order for receipt confirmation failed", { orderId, error: orderError });
    return fail("Không thể tải thông tin đơn hàng để xác nhận nhận hàng.", 500);
  }
  if (!orderRaw) return fail("Order not found", 404);
  const order = orderRaw as OrderConfirmationData;
  const status = Array.isArray(order.order_statuses) ? order.order_statuses[0] ?? null : order.order_statuses;
  if (status?.code !== OrderStatusCode.DELIVERED) {
    return fail("Chỉ có thể xác nhận sau khi đơn hàng được cập nhật đã giao thành công", 409);
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
  if (legError) {
    console.error("Loading last-mile leg for receipt confirmation failed", { orderId, error: legError });
    return fail("Không thể tải chặng giao cuối để xác nhận nhận hàng.", 500);
  }
  if (!lastMileLeg) return fail("Đơn hàng chưa có chặng giao cuối", 409);

  const { data: delivery, error: deliveryError } = await supabase
    .from("deliveries")
    .select("id, received_at")
    .eq("shipment_leg_id", lastMileLeg.id)
    .maybeSingle();
  if (deliveryError) {
    console.error("Loading delivery for receipt confirmation failed", { orderId, error: deliveryError });
    return fail("Không thể tải thông tin giao nhận để xác nhận nhận hàng.", 500);
  }
  if (!delivery) return fail("Chặng giao cuối chưa có bản ghi giao nhận", 409);

  const confirmedAt = delivery.received_at ?? new Date().toISOString();
  const blockchainEnabled = isBlockchainWriteEnabled();
  const eventType = BlockchainEventType.RECEIVER_CONFIRMED;
  const { payload: eventPayload, hash: eventDataHash } = hashEventPayload({
    deliveryId: delivery.id,
    confirmedAt,
    note: parsed.data.note ?? null,
    orderId,
    trackingCode: order.tracking_code,
    eventType,
    performedBy: auth.userId,
  });

  const { data: rpcResult, error: confirmationError } = await supabase.rpc("confirm_receiver_delivery_atomic", {
    p_order_id: orderId,
    p_delivery_id: delivery.id,
    p_user_id: auth.userId,
    p_user_role: auth.roleCode,
    p_confirmed_at: confirmedAt,
    p_note: parsed.data.note ?? null,
    p_enqueue_blockchain: blockchainEnabled,
    p_event_type: blockchainEnabled ? eventType : null,
    p_event_data_hash: blockchainEnabled ? eventDataHash : null,
    p_event_payload: blockchainEnabled ? eventPayload : null,
  });
  if (confirmationError) {
    if (confirmationError.message.includes("Forbidden")) return fail("Tài khoản không phải người nhận của đơn hàng", 403);
    if (confirmationError.message.includes("Order is not delivered")) {
      return fail("Chỉ có thể xác nhận sau khi đơn hàng được cập nhật đã giao thành công", 409);
    }
    console.error("Atomic receiver confirmation failed", confirmationError);
    return fail("Không thể xác nhận nhận hàng. Vui lòng thử lại.", 500);
  }
  const parsedResult = confirmationResultSchema.safeParse(rpcResult);
  if (!parsedResult.success) return fail("Database trả kết quả xác nhận nhận hàng không hợp lệ", 500);
  const confirmation = parsedResult.data;

  let blockchainStatus: "pending" | "confirmed" | "failed" | "disabled" = blockchainEnabled ? "pending" : "disabled";
  let warning: string | undefined;

  if (blockchainEnabled && confirmation.event_id) {
    if (confirmation.status === "already_confirmed") {
      const { data: existingEvent, error: eventError } = await supabase
        .from("blockchain_events")
        .select("id, event_data_hash, event_payload, performed_by, tx_status")
        .eq("id", confirmation.event_id)
        .maybeSingle();
      if (eventError) {
        warning = "Đã xác nhận nhận hàng nhưng không kiểm tra được trạng thái Blockchain event.";
      } else if (existingEvent?.tx_status === "failed") {
        const parsedEvent = blockchainEventSchema.safeParse(existingEvent);
        const payload = parsedEvent.success ? parsedEvent.data.event_payload : null;
        const verifiedPayload = payload ? hashEventPayload(payload) : null;
        const payloadMatchesEvent = Boolean(
          parsedEvent.success
          && parsedEvent.data.performed_by
          && payload
          && payload.performedBy === parsedEvent.data.performed_by
          && payload.orderId === orderId
          && payload.trackingCode === order.tracking_code
          && payload.eventType === eventType
          && payload.deliveryId === delivery.id
          && typeof payload.confirmedAt === "string"
          && Date.parse(payload.confirmedAt) === Date.parse(confirmation.confirmed_at)
          && verifiedPayload?.hash === parsedEvent.data.event_data_hash,
        );
        if (!parsedEvent.success || !payloadMatchesEvent || !parsedEvent.data.performed_by) {
          warning = "Đã xác nhận nhận hàng nhưng event Blockchain thiếu dữ liệu gốc hợp lệ để retry.";
          blockchainStatus = "failed";
        } else {
          const { data: claimedEvent, error: claimError } = await supabase
            .from("blockchain_events")
            .update({ tx_status: "pending" })
            .eq("id", parsedEvent.data.id)
            .eq("tx_status", "failed")
            .select("id")
            .maybeSingle();
          if (claimError) {
            warning = "Đã xác nhận nhận hàng nhưng không thể lên lịch thử lại Blockchain event.";
            blockchainStatus = "failed";
          } else if (claimedEvent) {
            const scheduled = await dispatchBlockchainEvent({
              eventId: claimedEvent.id,
              trackingCode: order.tracking_code,
              eventType,
              performedBy: parsedEvent.data.performed_by,
              eventDataHash: parsedEvent.data.event_data_hash,
            });
            if (!scheduled) {
              const { error: resetError } = await supabase
                .from("blockchain_events")
                .update({ tx_status: "failed" })
                .eq("id", claimedEvent.id)
                .eq("tx_status", "pending");
              if (resetError) console.error("Could not restore failed Blockchain event status", resetError);
              warning = "Đã xác nhận nhận hàng; Blockchain event vẫn cần được đối soát.";
              blockchainStatus = "failed";
            }
          } else {
            blockchainStatus = "pending";
          }
        }
      } else if (existingEvent?.tx_status === "confirmed") {
        blockchainStatus = "confirmed";
      } else if (!existingEvent) {
        warning = "Đã xác nhận nhận hàng nhưng không tìm thấy Blockchain event để đối soát.";
        blockchainStatus = "failed";
      }
    } else {
      const scheduled = await dispatchBlockchainEvent({
        eventId: confirmation.event_id,
        trackingCode: order.tracking_code,
        eventType,
        performedBy: auth.userId,
        eventDataHash,
      });
      if (!scheduled) {
        const { error: markError } = await supabase
          .from("blockchain_events")
          .update({ tx_status: "failed" })
          .eq("id", confirmation.event_id)
          .eq("tx_status", "pending");
        if (markError) console.error("Could not mark unscheduled Blockchain event failed", markError);
        warning = "Đã xác nhận nhận hàng nhưng Blockchain event chưa được lên lịch và cần đối soát.";
        blockchainStatus = "failed";
      }
    }
  } else if (blockchainEnabled && confirmation.status === "already_confirmed") {
    warning = "Đã xác nhận nhận hàng nhưng không có Blockchain event để thử lại; cần đối soát.";
    blockchainStatus = "failed";
  }

  return ok({
    confirmed_at: confirmation.confirmed_at,
    already_confirmed: confirmation.status === "already_confirmed",
    blockchain_status: blockchainStatus,
    ...(warning ? { warning } : {}),
  });
}
