import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  BlockchainEventType,
  CodTransactionStatus,
  DeliveryAttemptResult,
  OrderStatusCode,
  RoleCode,
  ShipmentLegStatusCode,
  ShipmentLegType,
} from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { queueBlockchainEvent } from "@/lib/blockchain/queue-event";
import { isOwnCloudinaryImage } from "@/lib/cloudinary";
import { getMaxDeliveryAttempts } from "@/lib/shipment-leg-rules";
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
  location_lat: z.number().min(-90).max(90).optional(),
  location_lng: z.number().min(-180).max(180).optional(),
  note: z.string().trim().max(500).optional(),
  image_url: z.string().url().optional(),
  /** Shipper xác nhận đã thu đủ tiền COD khi giao thành công. */
  cod_collected: z.boolean().optional(),
});

type DriverStatusCode = z.infer<typeof scanEventSchema>["status_code"];

interface DeliveryRow {
  id: string;
  order_id: string;
  shipment_leg_id: string | null;
  delivery_staff_id: string;
  orders: {
    tracking_code: string;
    cod_amount: number;
    status_id: string;
    order_statuses: { code: string } | null;
  } | null;
}

interface LegRow {
  id: string;
  leg_type: string;
  status: string;
  started_at: string | null;
  assigned_at: string | null;
  attempt_no: number;
  is_return: boolean;
}

const WAITING_PICKUP_STATUSES: string[] = [
  OrderStatusCode.CREATED,
  OrderStatusCode.PENDING_ASSIGNMENT,
  OrderStatusCode.ASSIGNED,
];
const READY_FOR_LAST_MILE_STATUSES: string[] = [
  OrderStatusCode.IN_WAREHOUSE,
  OrderStatusCode.IN_TRANSIT,
  OrderStatusCode.REDELIVERY,
];

/** Kiểm tra điều kiện chuyển trạng thái; trả về thông báo lỗi nếu không hợp lệ. */
function transitionError(statusCode: DriverStatusCode, leg: LegRow, orderStatusCode: string | null): string | null {
  const isPickupEvent = statusCode === BlockchainEventType.PICKED_UP || statusCode === BlockchainEventType.PICKUP_FAILED;
  if (isPickupEvent) {
    if (leg.leg_type !== ShipmentLegType.PICKUP || leg.status !== ShipmentLegStatusCode.ASSIGNED) {
      return "Chặng lấy hàng chưa được phân công hoặc đã bắt đầu xử lý";
    }
    return WAITING_PICKUP_STATUSES.includes(orderStatusCode ?? "")
      ? null
      : "Đơn hàng không còn ở trạng thái chờ lấy hàng";
  }

  if (leg.leg_type !== ShipmentLegType.LAST_MILE || leg.status !== ShipmentLegStatusCode.IN_PROGRESS) {
    return "Chặng giao cuối chưa được xuất kho hoặc đã kết thúc";
  }
  if (statusCode === BlockchainEventType.DELIVERING) {
    const ready = leg.is_return
      ? orderStatusCode === OrderStatusCode.RETURNING
      : READY_FOR_LAST_MILE_STATUSES.includes(orderStatusCode ?? "");
    return ready ? null : "Đơn hàng chưa ở trạng thái sẵn sàng giao cuối";
  }
  const expected = leg.is_return ? OrderStatusCode.RETURNING : OrderStatusCode.DELIVERING;
  return orderStatusCode === expected ? null : "Tài xế phải xác nhận đã nhận hàng và bắt đầu giao trước";
}

/**
 * POST /api/deliveries/:id/events — shipper cập nhật các mốc thuộc chặng được
 * phân công: lấy hàng (thành công/thất bại), nhận hàng tại kho phát để giao,
 * kết quả giao. Chặng hoàn dùng cùng thao tác nhưng giao về người gửi.
 * Mốc nhập/xuất kho do WAREHOUSE_STAFF xử lý ở API warehouse-events.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DELIVERY_STAFF) {
    return fail("Forbidden", 403);
  }

  const { id: deliveryId } = await params;
  const parsed = scanEventSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);
  const input = parsed.data;
  const note = input.note?.trim() || null;

  const supabase = getSupabaseServiceClient();
  const { data: deliveryRaw, error: deliveryError } = await supabase
    .from("deliveries")
    .select("id, order_id, shipment_leg_id, delivery_staff_id, orders(tracking_code, cod_amount, status_id, order_statuses(code))")
    .eq("id", deliveryId)
    .maybeSingle();
  if (deliveryError) return fail(deliveryError.message, 500);
  const delivery = deliveryRaw as unknown as DeliveryRow | null;
  if (!delivery || !delivery.orders) return fail("Delivery not found", 404);
  if (auth.roleCode === RoleCode.DELIVERY_STAFF && delivery.delivery_staff_id !== auth.userId) {
    return fail("Forbidden", 403);
  }
  if (!delivery.shipment_leg_id) return fail("Bản ghi giao nhận chưa gắn với chặng vận chuyển", 409);

  const { data: legRaw, error: legError } = await supabase
    .from("shipment_legs")
    .select("id, leg_type, status, started_at, assigned_at, attempt_no, is_return")
    .eq("id", delivery.shipment_leg_id)
    .maybeSingle();
  if (legError) return fail(legError.message, 500);
  const leg = legRaw as LegRow | null;
  if (!leg) return fail("Không tìm thấy chặng vận chuyển", 404);

  const order = delivery.orders;
  const currentStatusCode = order.order_statuses?.code ?? null;
  const currentStatusId = order.status_id;
  const invalidTransition = transitionError(input.status_code, leg, currentStatusCode);
  if (invalidTransition) return fail(invalidTransition, 409);

  const isFailure = input.status_code === BlockchainEventType.PICKUP_FAILED
    || input.status_code === BlockchainEventType.DELIVERY_FAILED;
  if (isFailure && !note) return fail("Báo thất bại phải kèm lý do", 400);

  const isDelivered = input.status_code === BlockchainEventType.DELIVERED;
  const codAmount = Number(order.cod_amount ?? 0);
  const collectsCod = isDelivered && !leg.is_return && codAmount > 0;
  if (isDelivered && !input.image_url?.trim()) {
    return fail("Giao thành công phải kèm ảnh minh chứng", 400);
  }
  if (input.image_url && !isOwnCloudinaryImage(input.image_url)) {
    return fail("Ảnh minh chứng phải được chụp và tải lên qua hệ thống", 400);
  }
  if (collectsCod && input.cod_collected !== true) {
    return fail("Vui lòng xác nhận đã thu đủ tiền COD trước khi hoàn tất giao hàng", 400);
  }

  // Mốc trong chặng hiện tại tính từ lúc xuất kho (hoặc lúc được phân công với
  // chặng lấy hàng) để lần giao lại không bị chặn bởi sự kiện của lần trước.
  const windowStart = leg.started_at ?? leg.assigned_at ?? "1970-01-01T00:00:00.000Z";
  // delivery_events.status_id là trạng thái đơn tương ứng với mốc.
  const eventStatusCode = input.status_code === BlockchainEventType.PICKUP_FAILED
    ? OrderStatusCode.PENDING_ASSIGNMENT
    : leg.is_return && isDelivered
      ? OrderStatusCode.RETURNED
      : input.status_code;
  const { data: statusRows, error: statusError } = await supabase
    .from("order_statuses")
    .select("id, code")
    .in("code", [OrderStatusCode.DELIVERING, eventStatusCode]);
  if (statusError) return fail(statusError.message, 500);
  const statusIdByCode = new Map((statusRows ?? []).map((row) => [row.code, row.id]));

  if (isDelivered || input.status_code === BlockchainEventType.DELIVERY_FAILED) {
    const { data: startedEvent, error: startedEventError } = await supabase
      .from("delivery_events")
      .select("id")
      .eq("delivery_id", deliveryId)
      .eq("status_id", statusIdByCode.get(OrderStatusCode.DELIVERING) ?? "")
      .gte("event_time", windowStart)
      .limit(1)
      .maybeSingle();
    if (startedEventError) return fail(startedEventError.message, 500);
    if (!startedEvent) return fail("Chưa ghi nhận tài xế nhận hàng tại kho", 409);
  }

  const eventStatusId = statusIdByCode.get(eventStatusCode);
  if (!eventStatusId) return fail("Status code invalid", 400);

  const { data: duplicateEvent, error: duplicateError } = await supabase
    .from("delivery_events")
    .select("id")
    .eq("delivery_id", deliveryId)
    .eq("status_id", eventStatusId)
    .gte("event_time", windowStart)
    .limit(1)
    .maybeSingle();
  if (duplicateError) return fail(duplicateError.message, 500);
  if (duplicateEvent) return fail("Mốc trạng thái này đã được ghi nhận cho chặng hiện tại", 409);

  const eventTime = new Date().toISOString();
  const { data: event, error: eventError } = await supabase
    .from("delivery_events")
    .insert({
      delivery_id: deliveryId,
      order_id: delivery.order_id,
      status_id: eventStatusId,
      from_status_id: currentStatusId,
      performed_by: auth.userId,
      event_time: eventTime,
      location_lat: input.location_lat ?? null,
      location_lng: input.location_lng ?? null,
      note,
      image_url: input.image_url ?? null,
    })
    .select("*")
    .single();
  if (eventError) return fail(eventError.message, 500);

  let attempt: { attempt_no: number } | null = null;
  let nextOrderStatusCode: string | null = null;
  if (input.status_code === BlockchainEventType.PICKED_UP) {
    nextOrderStatusCode = OrderStatusCode.PICKED_UP;
  } else if (input.status_code === BlockchainEventType.PICKUP_FAILED) {
    nextOrderStatusCode = OrderStatusCode.PENDING_ASSIGNMENT;
  } else if (input.status_code === BlockchainEventType.DELIVERING) {
    nextOrderStatusCode = leg.is_return ? null : OrderStatusCode.DELIVERING;
  } else {
    const { data: previousAttempts, error: attemptsError } = await supabase
      .from("delivery_attempts")
      .select("attempt_no")
      .eq("delivery_id", deliveryId)
      .order("attempt_no", { ascending: false })
      .limit(1);
    if (attemptsError) return fail(attemptsError.message, 500);
    const attemptNo = (previousAttempts?.[0]?.attempt_no ?? 0) + 1;

    const { data: attemptRow, error: attemptError } = await supabase
      .from("delivery_attempts")
      .insert({
        delivery_id: deliveryId,
        attempt_no: attemptNo,
        attempt_time: eventTime,
        result: isDelivered ? DeliveryAttemptResult.SUCCESS : DeliveryAttemptResult.FAILED,
        reason_fail: isDelivered ? null : note,
        note,
      })
      .select("*")
      .single();
    if (attemptError) return fail(attemptError.message, 500);
    attempt = attemptRow;

    if (isDelivered) {
      nextOrderStatusCode = leg.is_return ? OrderStatusCode.RETURNED : OrderStatusCode.DELIVERED;
    } else if (!leg.is_return) {
      // Hết số lần giao: đơn chờ kho nhận lại hàng để tự lập tuyến hoàn.
      const maxAttempts = await getMaxDeliveryAttempts(supabase);
      nextOrderStatusCode = attemptNo < maxAttempts ? OrderStatusCode.REDELIVERY : OrderStatusCode.DELIVERY_FAILED;
    }
  }

  const legUpdate = input.status_code === BlockchainEventType.PICKED_UP
    ? { status: ShipmentLegStatusCode.IN_PROGRESS, started_at: eventTime }
    : isFailure
      ? { status: ShipmentLegStatusCode.FAILED }
      : isDelivered
        ? { status: ShipmentLegStatusCode.COMPLETED, completed_at: eventTime }
        : null;
  if (legUpdate) {
    const { error: legUpdateError } = await supabase.from("shipment_legs").update(legUpdate).eq("id", leg.id);
    if (legUpdateError) return fail(legUpdateError.message, 500);
  }

  if (nextOrderStatusCode) {
    let nextStatusId = statusIdByCode.get(nextOrderStatusCode);
    if (!nextStatusId) {
      const { data: nextStatus } = await supabase
        .from("order_statuses")
        .select("id")
        .eq("code", nextOrderStatusCode)
        .maybeSingle();
      nextStatusId = nextStatus?.id;
    }
    if (!nextStatusId) return fail("Không tìm thấy trạng thái tiếp theo", 500);
    await supabase
      .from("orders")
      .update({ status_id: nextStatusId })
      .eq("id", delivery.order_id)
      .eq("status_id", currentStatusId);
  }

  let codTransaction: unknown = null;
  if (collectsCod) {
    const { data: codRow, error: codError } = await supabase
      .from("cod_transactions")
      .insert({
        order_id: delivery.order_id,
        amount: codAmount,
        collected_by: auth.userId,
        collected_at: eventTime,
        status: CodTransactionStatus.COLLECTED,
        note: `Thu khi giao thành công, delivery ${deliveryId}`,
      })
      .select("*")
      .single();
    if (codError && codError.code !== "23505") return fail(codError.message, 500);
    codTransaction = codRow;
  }

  const chainEventType = leg.is_return && isDelivered ? BlockchainEventType.RETURNED : input.status_code;
  await queueBlockchainEvent({
    orderId: delivery.order_id,
    trackingCode: order.tracking_code,
    eventType: chainEventType,
    performedBy: auth.userId,
    payload: {
      deliveryEventId: event.id,
      deliveryId,
      shipmentLegId: leg.id,
      legType: leg.leg_type,
      isReturn: leg.is_return,
      legAttemptNo: leg.attempt_no,
      deliveryAttemptNo: attempt?.attempt_no ?? null,
      fromStatus: currentStatusCode,
      toStatus: nextOrderStatusCode ?? currentStatusCode,
      note,
      imageUrl: input.image_url ?? null,
      locationLat: input.location_lat ?? null,
      locationLng: input.location_lng ?? null,
      codCollectedAmount: collectsCod ? codAmount : null,
      eventTime,
    },
  });

  return ok({
    event,
    attempt,
    order_status: nextOrderStatusCode ?? currentStatusCode,
    cod_transaction: codTransaction,
  }, 201);
}
