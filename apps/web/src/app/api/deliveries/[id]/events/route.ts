import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { BlockchainEventType, RoleCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { queueBlockchainEvent } from "@/lib/blockchain/queue-event";
import { isOwnCloudinaryImage } from "@/lib/cloudinary";
import { ok, fail } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const scanEventSchema = z.object({
  status_code: z.enum([
    BlockchainEventType.PICKED_UP,
    BlockchainEventType.PICKUP_FAILED,
    BlockchainEventType.DELIVERING,
    BlockchainEventType.DELIVERED,
    BlockchainEventType.DELIVERY_FAILED,
  ]),
  expected_attempt_no: z.number().int().positive(),
  location_lat: z.number().min(-90).max(90).optional(),
  location_lng: z.number().min(-180).max(180).optional(),
  note: z.string().trim().max(500).optional(),
  image_url: z.string().url().optional(),
  cod_collected: z.boolean().optional(),
});

type AtomicResult = {
  event: Record<string, unknown>;
  attempt: Record<string, unknown> | null;
  order_status: string;
  cod_transaction: Record<string, unknown> | null;
  was_created: boolean;
  tracking_code: string;
  shipment_leg_id: string;
  leg_type: string;
  is_return: boolean;
  leg_attempt_no: number;
  from_status: string;
  to_status: string;
  chain_event_type: string;
  cod_collected_amount: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAtomicResult(value: unknown): AtomicResult | null {
  if (!isRecord(value) || !isRecord(value.event)) return null;
  if (
    typeof value.event.id !== "string"
    || typeof value.event.order_id !== "string"
    || typeof value.event.event_time !== "string"
    || (value.attempt !== null && (!isRecord(value.attempt) || typeof value.attempt.attempt_no !== "number"))
    || (value.cod_transaction !== null && !isRecord(value.cod_transaction))
    || typeof value.order_status !== "string"
    || typeof value.was_created !== "boolean"
    || typeof value.tracking_code !== "string"
    || typeof value.shipment_leg_id !== "string"
    || typeof value.leg_type !== "string"
    || typeof value.is_return !== "boolean"
    || typeof value.leg_attempt_no !== "number"
    || typeof value.from_status !== "string"
    || typeof value.to_status !== "string"
    || typeof value.chain_event_type !== "string"
    || (value.cod_collected_amount !== null && typeof value.cod_collected_amount !== "number")
  ) {
    return null;
  }
  if (!Object.values(BlockchainEventType).includes(value.chain_event_type as (typeof BlockchainEventType)[keyof typeof BlockchainEventType])) {
    return null;
  }
  return value as AtomicResult;
}

function rpcErrorResponse(message: string) {
  if (message.includes("IDEMPOTENCY_KEY_REUSED")) {
    return fail("Idempotency-Key đã được dùng cho nội dung khác.", 409);
  }
  if (message.includes("EVENT_ALREADY_RECORDED")) {
    return fail("Mốc trạng thái này đã được ghi nhận cho lượt hiện tại.", 409);
  }
  if (message.includes("STALE_DELIVERY_ATTEMPT")) {
    return fail("Lượt giao đã thay đổi. Hãy tải lại chặng trước khi tiếp tục.", 409);
  }
  if (message.includes("DELIVERY_NOT_FOUND")) return fail("Delivery not found", 404);
  if (message.includes("ACTOR_FORBIDDEN") || message.includes("DELIVERY_NOT_ASSIGNED")) {
    return fail("Forbidden", 403);
  }
  if (message.includes("COD_CONFIRMATION_REQUIRED")) {
    return fail("Cần xác nhận đã thu đủ COD trước khi hoàn tất giao hàng.", 400);
  }
  if (
    message.includes("INVALID_DELIVERY_EVENT")
    || message.includes("INVALID_IDEMPOTENCY_REQUEST")
    || message.includes("INVALID_EVENT_NOTE")
  ) {
    return fail("Dữ liệu mốc giao hàng không hợp lệ.", 400);
  }
  if (
    message.includes("DELIVERY_LEG_MISSING")
    || message.includes("INVALID_DELIVERY_TRANSITION")
    || message.includes("DELIVERY_START_REQUIRED")
    || message.includes("COD_ALREADY_EXISTS")
    || message.includes("ORDER_STATUS_CHANGED")
  ) {
    return fail("Trạng thái giao hàng đã thay đổi hoặc không thỏa điều kiện nghiệp vụ.", 409);
  }
  console.error("record_delivery_event_atomic failed", { message });
  return fail("Không thể cập nhật mốc giao hàng.", 500);
}

/**
 * POST /api/deliveries/:id/events — ghi một delivery event nguyên tử cùng
 * attempt, trạng thái chặng/đơn và giao dịch COD (nếu có).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DELIVERY_STAFF) {
    return fail("Forbidden", 403);
  }

  const idempotencyKey = z.string().uuid().safeParse(request.headers.get("Idempotency-Key"));
  if (!idempotencyKey.success) return fail("Thiếu hoặc sai khóa chống gửi lặp.", 400);

  const { id: deliveryId } = await params;
  const parsedDeliveryId = z.string().uuid().safeParse(deliveryId);
  if (!parsedDeliveryId.success) return fail("Mã delivery không hợp lệ.", 400);
  const parsedActorId = z.string().uuid().safeParse(auth.userId);
  if (!parsedActorId.success) return fail("Unauthorized", 401);
  const normalizedDeliveryId = parsedDeliveryId.data.toLowerCase();
  const normalizedActorId = parsedActorId.data.toLowerCase();
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return fail("Dữ liệu mốc giao hàng không hợp lệ.", 400);
  }
  const parsed = scanEventSchema.safeParse(requestBody);
  if (!parsed.success) return fail(parsed.error.message, 400);

  const input = parsed.data;
  if (input.cod_collected === true && input.status_code !== BlockchainEventType.DELIVERED) {
    return fail("Chỉ xác nhận thu COD khi giao hàng thành công.", 400);
  }
  const note = input.note?.trim() || null;
  const isDelivered = input.status_code === BlockchainEventType.DELIVERED;
  if (
    input.status_code === BlockchainEventType.PICKUP_FAILED
    || input.status_code === BlockchainEventType.DELIVERY_FAILED
  ) {
    if (!note) return fail("Báo thất bại phải kèm lý do", 400);
  }
  if (isDelivered && !input.image_url?.trim()) {
    return fail("Giao thành công phải kèm ảnh minh chứng", 400);
  }
  if (input.image_url && !isOwnCloudinaryImage(input.image_url)) {
    return fail("Ảnh minh chứng phải được chụp và tải lên qua hệ thống", 400);
  }
  const normalizedRequest = {
    delivery_id: normalizedDeliveryId,
    actor_id: normalizedActorId,
    actor_role_code: auth.roleCode,
    expected_attempt_no: input.expected_attempt_no,
    status_code: input.status_code,
    location_lat: input.location_lat ?? null,
    location_lng: input.location_lng ?? null,
    note,
    image_url: input.image_url ?? null,
    cod_collected: input.cod_collected ?? false,
  };
  const requestHash = createHash("sha256").update(JSON.stringify(normalizedRequest)).digest("hex");

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.rpc("record_delivery_event_atomic", {
    p_delivery_id: normalizedDeliveryId,
    p_actor_id: normalizedActorId,
    p_actor_role_code: auth.roleCode,
    p_expected_attempt_no: input.expected_attempt_no,
    p_status_code: input.status_code,
    p_location_lat: input.location_lat ?? null,
    p_location_lng: input.location_lng ?? null,
    p_note: note,
    p_image_url: input.image_url ?? null,
    p_cod_collected: input.cod_collected ?? false,
    p_idempotency_key: idempotencyKey.data,
    p_request_hash: requestHash,
  });
  if (error) return rpcErrorResponse(error.message);

  const result = parseAtomicResult(data);
  if (!result) {
    console.error("record_delivery_event_atomic returned an invalid result", { deliveryId });
    return fail("Không đọc được kết quả cập nhật giao hàng.", 500);
  }

  if (result.was_created) {
    try {
      const queueResult = await queueBlockchainEvent({
        orderId: String(result.event.order_id),
        trackingCode: result.tracking_code,
        eventType: result.chain_event_type as (typeof BlockchainEventType)[keyof typeof BlockchainEventType],
        performedBy: auth.userId,
        payload: {
          deliveryEventId: result.event.id,
          deliveryId,
          shipmentLegId: result.shipment_leg_id,
          legType: result.leg_type,
          isReturn: result.is_return,
          legAttemptNo: result.leg_attempt_no,
          deliveryAttemptNo: typeof result.attempt?.attempt_no === "number" ? result.attempt.attempt_no : null,
          fromStatus: result.from_status,
          toStatus: result.to_status,
          note,
          imageUrl: input.image_url ?? null,
          locationLat: input.location_lat ?? null,
          locationLng: input.location_lng ?? null,
          codCollectedAmount: result.cod_collected_amount,
          eventTime: result.event.event_time,
        },
      });
      if (queueResult.status === "enqueue_failed") {
        console.error("Delivery event committed, but Blockchain enqueue failed", {
          deliveryEventId: result.event.id,
          error: queueResult.error,
        });
      }
    } catch (queueError) {
      console.error("Delivery event committed, but Blockchain enqueue threw", {
        deliveryEventId: result.event.id,
        queueError,
      });
    }
  }

  return ok({
    event: result.event,
    attempt: result.attempt,
    order_status: result.order_status,
    cod_transaction: result.cod_transaction,
    was_created: result.was_created,
  }, result.was_created ? 201 : 200);
}
