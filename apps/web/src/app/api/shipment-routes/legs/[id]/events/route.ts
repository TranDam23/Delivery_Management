import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  BlockchainEventType,
  OrderStatusCode,
  PackageCondition,
  RoleCode,
  ShipmentLegStatusCode,
  ShipmentLegType,
  WarehouseEventType,
} from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { queueBlockchainEvent } from "@/lib/blockchain/queue-event";
import { getUserWarehouseId } from "@/lib/dispatcher-scope";
import { isPreviousLegReady } from "@/lib/shipment-leg-rules";
import { createReturnShipmentRoute } from "@/lib/shipment-route-planner";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const warehouseEventSchema = z.object({
  warehouse_id: z.string().uuid(),
  event_type: z.enum([WarehouseEventType.INBOUND, WarehouseEventType.OUTBOUND]),
  note: z.string().trim().max(500).optional(),
  /** Kết quả kiểm hàng, bắt buộc khi nhập kho. */
  package_condition: z.enum([PackageCondition.INTACT, PackageCondition.DAMAGED]).optional(),
  actual_weight_kg: z.number().positive().max(10000).optional(),
});

interface ShipmentLegRow {
  id: string;
  order_id: string;
  sequence_no: number;
  leg_type: string;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  responsibility_province: string | null;
  assigned_staff_id: string | null;
  status: string;
  attempt_no: number;
  is_return: boolean;
  orders: { tracking_code: string; order_statuses: { code: string } | null } | null;
}

function canScanWarehouse(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.WAREHOUSE_STAFF;
}

function isWarehouseEventAllowed(leg: ShipmentLegRow, eventType: string, warehouseId: string): boolean {
  if (leg.leg_type === ShipmentLegType.PICKUP) {
    return eventType === WarehouseEventType.INBOUND && warehouseId === leg.to_warehouse_id;
  }
  if (leg.leg_type === ShipmentLegType.LAST_MILE) {
    // Xuất kho giao cho shipper, hoặc nhận lại kiện khi giao thất bại.
    return warehouseId === leg.from_warehouse_id;
  }
  return (
    (eventType === WarehouseEventType.OUTBOUND && warehouseId === leg.from_warehouse_id) ||
    (eventType === WarehouseEventType.INBOUND && warehouseId === leg.to_warehouse_id)
  );
}

/** Kiểm tra trạng thái chặng có cho phép sự kiện kho này không. */
function statusError(leg: ShipmentLegRow, eventType: string): string | null {
  if (eventType === WarehouseEventType.OUTBOUND) {
    if (leg.status !== ShipmentLegStatusCode.PENDING && leg.status !== ShipmentLegStatusCode.ASSIGNED) {
      return "Chặng này không ở trạng thái chờ xuất kho";
    }
    if (leg.leg_type === ShipmentLegType.LAST_MILE
      && (leg.status !== ShipmentLegStatusCode.ASSIGNED || !leg.assigned_staff_id)) {
      return "Chặng giao cuối phải được phân công shipper trước khi xuất kho";
    }
    return null;
  }

  if (leg.leg_type === ShipmentLegType.PICKUP) {
    return leg.status === ShipmentLegStatusCode.IN_PROGRESS
      ? null
      : "Shipper chưa xác nhận đã lấy hàng, chưa thể nhập kho";
  }
  if (leg.leg_type === ShipmentLegType.TRANSFER) {
    return leg.status === ShipmentLegStatusCode.IN_PROGRESS
      ? null
      : "Kho gửi chưa xác nhận xuất kho chặng trung chuyển này";
  }
  return leg.status === ShipmentLegStatusCode.FAILED
    ? null
    : "Chỉ nhận lại hàng tại kho phát khi chặng giao cuối đã báo giao thất bại";
}

function orderStatusForEvent(leg: ShipmentLegRow, eventType: string): string | null {
  // Suốt tuyến hoàn đơn giữ trạng thái RETURNING; chặng giao cuối chỉ đổi
  // trạng thái đơn qua thao tác của shipper.
  if (leg.is_return || leg.leg_type === ShipmentLegType.LAST_MILE) return null;
  if (eventType === WarehouseEventType.INBOUND) return OrderStatusCode.IN_WAREHOUSE;
  if (leg.leg_type === ShipmentLegType.TRANSFER) return OrderStatusCode.IN_TRANSIT;
  return null;
}

function blockchainEventFor(leg: ShipmentLegRow, eventType: string): BlockchainEventType | null {
  if (eventType === WarehouseEventType.INBOUND) return BlockchainEventType.IN_WAREHOUSE;
  if (leg.leg_type === ShipmentLegType.TRANSFER) return BlockchainEventType.IN_TRANSIT;
  // Xuất kho chặng giao cuối được ghi chain ở mốc DELIVERING do shipper xác nhận.
  return null;
}

/** POST /api/shipment-routes/legs/:id/events — ghi nhận nhập kho/xuất kho cho một chặng. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canScanWarehouse(auth.roleCode)) return fail("Forbidden", 403);

  const { id } = await params;
  const parsed = warehouseEventSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);
  const input = parsed.data;
  const isInbound = input.event_type === WarehouseEventType.INBOUND;

  const supabase = getSupabaseServiceClient();
  const { data: legRaw, error: legError } = await supabase
    .from("shipment_legs")
    .select("id, order_id, sequence_no, leg_type, from_warehouse_id, to_warehouse_id, responsibility_province, assigned_staff_id, status, attempt_no, is_return, orders(tracking_code, order_statuses(code))")
    .eq("id", id)
    .maybeSingle();
  if (legError) return fail(legError.message, 500);

  const leg = legRaw as unknown as ShipmentLegRow | null;
  if (!leg || !leg.orders) return fail("Không tìm thấy chặng vận chuyển", 404);
  if (auth.roleCode === RoleCode.WAREHOUSE_STAFF) {
    const warehouseScope = await getUserWarehouseId(auth);
    if (warehouseScope.error) return fail(warehouseScope.error, 500);
    if (!warehouseScope.warehouseId) return fail("Tài khoản nhân viên kho chưa được gán kho phụ trách", 409);
    if (input.warehouse_id !== warehouseScope.warehouseId) {
      return fail("Bạn chỉ được ghi nhận sự kiện tại kho được Admin gán", 403);
    }
  }
  if (!isWarehouseEventAllowed(leg, input.event_type, input.warehouse_id)) {
    return fail("Kho hoặc loại sự kiện không phù hợp với chặng này", 400);
  }
  if (leg.status === ShipmentLegStatusCode.CANCELLED || leg.status === ShipmentLegStatusCode.COMPLETED) {
    return fail("Chặng này đã kết thúc hoặc bị hủy", 409);
  }
  const invalidStatus = statusError(leg, input.event_type);
  if (invalidStatus) return fail(invalidStatus, 409);

  if (isInbound) {
    if (!input.package_condition) return fail("Vui lòng ghi nhận tình trạng kiện hàng khi nhập kho", 400);
    if (input.package_condition === PackageCondition.DAMAGED && !input.note) {
      return fail("Kiện hư hỏng phải kèm mô tả tình trạng", 400);
    }
  } else if (leg.sequence_no > 1) {
    const previous = await isPreviousLegReady(supabase, leg);
    if (previous.error) return fail(previous.error, 500);
    if (!previous.ready) return fail("Chặng trước chưa hoàn tất, chưa thể xuất kho chặng này", 409);
  }

  const attemptNo = leg.attempt_no ?? 1;
  const { data: previousEvents, error: previousEventsError } = await supabase
    .from("warehouse_events")
    .select("id")
    .eq("shipment_leg_id", id)
    .eq("warehouse_id", input.warehouse_id)
    .eq("event_type", input.event_type)
    .eq("attempt_no", attemptNo)
    .limit(1);
  if (previousEventsError) return fail(previousEventsError.message, 500);
  if (previousEvents && previousEvents.length > 0) return fail("Sự kiện kho này đã được ghi nhận", 409);

  const eventTime = new Date().toISOString();
  const { data: warehouseEvent, error: warehouseEventError } = await supabase
    .from("warehouse_events")
    .insert({
      order_id: leg.order_id,
      shipment_leg_id: id,
      warehouse_id: input.warehouse_id,
      event_type: input.event_type,
      performed_by: auth.userId,
      event_time: eventTime,
      attempt_no: attemptNo,
      note: input.note || null,
      package_condition: isInbound ? input.package_condition ?? null : null,
      actual_weight_kg: isInbound ? input.actual_weight_kg ?? null : null,
    })
    .select("*")
    .single();
  if (warehouseEventError) {
    if (warehouseEventError.code === "23505") return fail("Sự kiện kho này đã được ghi nhận", 409);
    return fail(warehouseEventError.message, 500);
  }

  // Nhận lại hàng sau giao thất bại không đổi trạng thái chặng: chặng vẫn
  // FAILED cho tới khi điều phối viên phân công giao lại hoặc lập tuyến hoàn.
  const isReturnedAfterFailure = isInbound && leg.leg_type === ShipmentLegType.LAST_MILE;
  const legUpdate = isReturnedAfterFailure
    ? null
    : isInbound
      ? { status: ShipmentLegStatusCode.COMPLETED, completed_at: eventTime }
      : { status: ShipmentLegStatusCode.IN_PROGRESS, started_at: eventTime };
  let updatedLeg: unknown = leg;
  if (legUpdate) {
    const { data, error: updatedLegError } = await supabase
      .from("shipment_legs")
      .update(legUpdate)
      .eq("id", id)
      .select("*")
      .single();
    if (updatedLegError) return fail(updatedLegError.message, 500);
    updatedLeg = data;
  }

  const nextOrderStatusCode = orderStatusForEvent(leg, input.event_type);
  if (nextOrderStatusCode) {
    const { data: nextStatus } = await supabase
      .from("order_statuses")
      .select("id")
      .eq("code", nextOrderStatusCode)
      .maybeSingle();
    if (nextStatus) {
      await supabase.from("orders").update({ status_id: nextStatus.id }).eq("id", leg.order_id);
    }
  }

  if (isInbound && input.package_condition === PackageCondition.DAMAGED) {
    const { error: alertError } = await supabase.from("alerts").insert({
      order_id: leg.order_id,
      alert_type: "PACKAGE_DAMAGED",
      title: "Kiện hàng hư hỏng khi nhập kho",
      message: `Đơn ${leg.orders.tracking_code}: ${input.note}`,
      details: {
        warehouse_event_id: warehouseEvent.id,
        warehouse_id: input.warehouse_id,
        shipment_leg_id: id,
        actual_weight_kg: input.actual_weight_kg ?? null,
      },
    });
    if (alertError) console.error("Create damaged package alert failed", alertError);
  }

  const blockchainEventType = blockchainEventFor(leg, input.event_type);
  if (blockchainEventType) {
    await queueBlockchainEvent({
      orderId: leg.order_id,
      trackingCode: leg.orders.tracking_code,
      eventType: blockchainEventType,
      performedBy: auth.userId,
      payload: {
        warehouseEventId: warehouseEvent.id,
        warehouseId: input.warehouse_id,
        warehouseEventType: input.event_type,
        shipmentLegId: id,
        sequenceNo: leg.sequence_no,
        legType: leg.leg_type,
        isReturn: leg.is_return,
        attemptNo,
        packageCondition: warehouseEvent.package_condition,
        actualWeightKg: warehouseEvent.actual_weight_kg,
        note: warehouseEvent.note,
        eventTime,
      },
    });
  }

  let returnRoute: unknown = null;
  let returnRouteError: string | null = null;
  if (isReturnedAfterFailure && !leg.is_return && leg.orders.order_statuses?.code === OrderStatusCode.DELIVERY_FAILED) {
    const result = await createReturnShipmentRoute(leg.order_id);
    if (result.error && !result.alreadyExists) {
      returnRouteError = result.error;
      console.error("Create return route failed", { orderId: leg.order_id, error: result.error });
    } else if (result.data) {
      returnRoute = result.data;
      await queueBlockchainEvent({
        orderId: leg.order_id,
        trackingCode: leg.orders.tracking_code,
        eventType: BlockchainEventType.RETURNING,
        performedBy: auth.userId,
        payload: {
          reason: "MAX_DELIVERY_ATTEMPTS_REACHED",
          failedShipmentLegId: id,
          returnLegIds: (result.data.legs as { id: string }[]).map((item) => item.id),
          eventTime,
        },
      });
    }
  }

  return ok({ warehouseEvent, leg: updatedLeg, returnRoute, returnRouteError }, 201);
}
