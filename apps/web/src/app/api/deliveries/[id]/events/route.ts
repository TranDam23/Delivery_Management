import type { NextRequest } from "next/server";
import { z } from "zod";
import { BlockchainEventType } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { recordDeliveryEventOnChain } from "@/lib/blockchain/record-event";
import { ok, fail } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const scanEventSchema = z.object({
  status_code: z.enum([
    BlockchainEventType.PICKED_UP,
    BlockchainEventType.IN_WAREHOUSE,
    BlockchainEventType.IN_TRANSIT,
    BlockchainEventType.DELIVERED,
    BlockchainEventType.DELIVERY_FAILED,
    BlockchainEventType.RETURNED,
    BlockchainEventType.CANCELLED,
  ]),
  location_lat: z.number().optional(),
  location_lng: z.number().optional(),
  note: z.string().optional(),
  image_url: z.string().url().optional(),
  /** Vi cua nhan vien giao hang de ky su kien on-chain (tuy chon nguoi dung/thiet bi). */
  performed_by_address: z.string().optional(),
});

/**
 * POST /api/deliveries/:id/events — nhan vien quet QR va cap nhat trang thai
 * van chuyen. Ghi 1 dong vao delivery_events, cap nhat orders.status_id, va
 * ghi moc su kien tuong ung len blockchain (bang blockchain_events).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { id: deliveryId } = await params;
  const parsed = scanEventSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const supabase = getSupabaseServiceClient();

  const { data: deliveryRaw, error: deliveryError } = await supabase
    .from("deliveries")
    .select("id, order_id, orders(tracking_code)")
    .eq("id", deliveryId)
    .maybeSingle();
  const delivery = deliveryRaw as
    | { id: string; order_id: string; orders: { tracking_code: string } | null }
    | null;
  if (deliveryError) return fail(deliveryError.message, 500);
  if (!delivery || !delivery.orders) return fail("Delivery not found", 404);

  const { data: status, error: statusError } = await supabase
    .from("order_statuses")
    .select("id")
    .eq("code", parsed.data.status_code)
    .single();
  if (statusError || !status) return fail("Status code invalid", 400);

  const { data: event, error: eventError } = await supabase
    .from("delivery_events")
    .insert({
      delivery_id: deliveryId,
      order_id: delivery.order_id,
      status_id: status.id,
      performed_by: auth.userId,
      location_lat: parsed.data.location_lat ?? null,
      location_lng: parsed.data.location_lng ?? null,
      note: parsed.data.note ?? null,
      image_url: parsed.data.image_url ?? null,
    })
    .select("*")
    .single();
  if (eventError) return fail(eventError.message, 500);

  await supabase.from("orders").update({ status_id: status.id }).eq("id", delivery.order_id);

  const trackingCode = delivery.orders.tracking_code;

  let blockchainResult: Awaited<ReturnType<typeof recordDeliveryEventOnChain>> | null = null;
  if (parsed.data.performed_by_address) {
    try {
      blockchainResult = await recordDeliveryEventOnChain({
        trackingCode,
        eventType: parsed.data.status_code,
        performedByAddress: parsed.data.performed_by_address,
        eventPayload: { deliveryEventId: event.id, ...parsed.data },
      });

      await supabase.from("blockchain_events").insert({
        order_id: delivery.order_id,
        event_type: parsed.data.status_code,
        event_data_hash: blockchainResult.eventDataHash,
        transaction_hash: blockchainResult.transactionHash,
        block_number: blockchainResult.blockNumber,
      });
    } catch (err) {
      // Khong chan luong nghiep vu neu ghi blockchain that bai — log de retry sau.
      console.error("recordDeliveryEventOnChain failed", err);
    }
  }

  return ok({ event, blockchainResult }, 201);
}
