import type { NextRequest } from "next/server";
import { z } from "zod";
import { OrderStatusCode, RoleCode, ShipmentLegStatusCode, ShipmentLegType } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { getUserOperationalScope, warehouseBelongsToScope } from "@/lib/dispatcher-scope";
import { checkLegAssignable } from "@/lib/shipment-leg-rules";

const assignSchema = z.object({
  order_id: z.string().uuid(),
  /** Bắt buộc gắn phân công với một chặng, không tạo delivery rời khỏi tuyến. */
  shipment_leg_id: z.string().uuid(),
  delivery_staff_id: z.string().uuid(),
});

/** POST /api/deliveries — dieu phoi vien phan cong nhan vien giao hang cho don. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DISPATCHER) {
    return fail("Forbidden", 403);
  }

  const parsed = assignSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const supabase = getSupabaseServiceClient();
  const warehouseScope = await getUserOperationalScope(auth);
  if (warehouseScope.error) return fail(warehouseScope.error, 500);
  if (auth.roleCode === RoleCode.DISPATCHER && !warehouseScope.warehouseId) {
    return fail("Tài khoản điều phối viên chưa được gán kho phụ trách", 409);
  }

  const { data: leg, error: legError } = await supabase
    .from("shipment_legs")
    .select("id, order_id, sequence_no, leg_type, from_warehouse_id, to_warehouse_id, responsibility_province, status, attempt_no, is_return")
    .eq("id", parsed.data.shipment_leg_id)
    .eq("order_id", parsed.data.order_id)
    .maybeSingle();
  if (legError) return fail(legError.message, 500);
  if (!leg) return fail("Chặng vận chuyển không tồn tại hoặc không thuộc đơn hàng", 404);
  const assignable = await checkLegAssignable(supabase, leg);
  if (assignable.error) return fail(assignable.error, assignable.status);

  const operationalWarehouseId = leg.leg_type === ShipmentLegType.PICKUP
    ? leg.to_warehouse_id
    : leg.from_warehouse_id;
  if (!operationalWarehouseId) return fail("Chặng chưa được gắn kho vận hành", 400);
  const { data: staff, error: staffError } = await supabase
    .from("users")
    .select("id, role_id, status, province, warehouse_id")
    .eq("id", parsed.data.delivery_staff_id)
    .maybeSingle();
  if (staffError) return fail(staffError.message, 500);
  if (!staff || staff.status !== "active") return fail("Nhân viên không tồn tại hoặc không hoạt động", 404);

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("code")
    .eq("id", staff.role_id)
    .maybeSingle();
  if (roleError) return fail(roleError.message, 500);
  if (!role || role.code !== RoleCode.DELIVERY_STAFF) {
    return fail("Chỉ nhân viên giao hàng mới được phân công vào chặng", 400);
  }
  const { data: operationalWarehouse, error: operationalWarehouseError } = await supabase
    .from("warehouses")
    .select("id, province, warehouse_level")
    .eq("id", operationalWarehouseId)
    .maybeSingle();
  if (operationalWarehouseError) return fail(operationalWarehouseError.message, 500);
  if (!operationalWarehouse) return fail("Kho vận hành của chặng không tồn tại", 400);
  if (auth.roleCode === RoleCode.DISPATCHER
    && !warehouseBelongsToScope(warehouseScope, operationalWarehouse)) {
    return fail("Chặng này không thuộc tỉnh/kho phụ trách của bạn", 403);
  }
  if (staff.warehouse_id !== operationalWarehouseId) {
    return fail("Nhân viên giao hàng phải thuộc đúng kho vận hành của chặng", 400);
  }

  const now = new Date().toISOString();
  const nextAttemptNo = leg.status === ShipmentLegStatusCode.FAILED
    ? Math.max(1, Number(leg.attempt_no ?? 1) + 1)
    : Math.max(1, Number(leg.attempt_no ?? 1));
  const legUpdate = {
    assigned_staff_id: staff.id,
    assigned_by: auth.userId,
    assigned_at: now,
    status: ShipmentLegStatusCode.ASSIGNED,
    attempt_no: nextAttemptNo,
    ...(leg.status === ShipmentLegStatusCode.FAILED ? { started_at: null, completed_at: null } : {}),
  };
  const { error: legUpdateError } = await supabase
    .from("shipment_legs")
    .update(legUpdate)
    .eq("id", leg.id);
  if (legUpdateError) return fail(legUpdateError.message, 500);

  const { data: existingDelivery, error: existingDeliveryError } = await supabase
    .from("deliveries")
    .select("id")
    .eq("shipment_leg_id", leg.id)
    .maybeSingle();
  if (existingDeliveryError) return fail(existingDeliveryError.message, 500);

  const deliveryPayload = {
    order_id: parsed.data.order_id,
    shipment_leg_id: leg.id,
    delivery_staff_id: staff.id,
    assigned_by: auth.userId,
    assigned_at: now,
    // Chiều hoàn được quyết định bởi chặng, không tin giá trị client gửi lên.
    is_return: leg.is_return,
  };
  const { data: delivery, error } = existingDelivery
    ? await supabase.from("deliveries").update(deliveryPayload).eq("id", existingDelivery.id).select("*").single()
    : await supabase.from("deliveries").insert(deliveryPayload).select("*").single();
  if (error) return fail(error.message, 500);

  const { data: orderLegs, error: orderLegsError } = await supabase
    .from("shipment_legs")
    .select("leg_type, status, assigned_staff_id")
    .eq("order_id", parsed.data.order_id);
  if (orderLegsError) return fail(orderLegsError.message, 500);
  const pickupLegAssigned = (orderLegs ?? []).some((item) =>
    item.leg_type === ShipmentLegType.PICKUP
      && item.status !== ShipmentLegStatusCode.CANCELLED
      && Boolean(item.assigned_staff_id),
  );
  if (pickupLegAssigned) {
    const { data: assignedStatus } = await supabase
      .from("order_statuses")
      .select("id")
      .eq("code", OrderStatusCode.ASSIGNED)
      .maybeSingle();
    const { data: assignableStatuses } = await supabase
      .from("order_statuses")
      .select("id")
      .in("code", [OrderStatusCode.CREATED, OrderStatusCode.PENDING_ASSIGNMENT]);
    if (assignedStatus && assignableStatuses && assignableStatuses.length > 0) {
      await supabase
        .from("orders")
        .update({ status_id: assignedStatus.id })
        .eq("id", parsed.data.order_id)
        .in("status_id", assignableStatuses.map((status) => status.id));
    }
  }

  return ok(delivery, 201);
}
