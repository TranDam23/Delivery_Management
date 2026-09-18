import type { NextRequest } from "next/server";
import { z } from "zod";
import { OrderStatusCode, RoleCode, ShipmentLegStatusCode, ShipmentLegType } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getUserOperationalScope, warehouseBelongsToScope } from "@/lib/dispatcher-scope";
import { checkLegAssignable } from "@/lib/shipment-leg-rules";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const assignmentSchema = z.object({
  assigned_staff_id: z.string().uuid(),
});

function canAssignLeg(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.DISPATCHER;
}

interface AssignmentLeg {
  id: string;
  order_id: string;
  sequence_no: number;
  leg_type: string;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  responsibility_province: string | null;
  status: string;
  attempt_no: number;
  is_return: boolean;
}

interface AssignmentWarehouse {
  id: string;
  province: string | null;
  warehouse_level: string;
}

/** PATCH /api/shipment-routes/legs/:id — phân công nhân viên cho một chặng. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canAssignLeg(auth.roleCode)) return fail("Forbidden", 403);

  const { id } = await params;
  const parsed = assignmentSchema.safeParse(await request.json());
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
    .eq("id", id)
    .maybeSingle();
  if (legError) return fail(legError.message, 500);
  if (!leg) return fail("Không tìm thấy chặng vận chuyển", 404);
  const assignmentLeg = leg as AssignmentLeg;
  const assignable = await checkLegAssignable(supabase, assignmentLeg);
  if (assignable.error) return fail(assignable.error, assignable.status);

  const operationalWarehouseId = assignmentLeg.leg_type === ShipmentLegType.PICKUP
    ? assignmentLeg.to_warehouse_id
    : assignmentLeg.from_warehouse_id;
  if (!operationalWarehouseId) return fail("Chặng chưa được gắn kho vận hành", 400);

  const warehouseIds = [assignmentLeg.from_warehouse_id, assignmentLeg.to_warehouse_id].filter(Boolean) as string[];
  const { data: warehouseRows, error: warehousesError } = warehouseIds.length > 0
    ? await supabase.from("warehouses").select("id, province, warehouse_level").in("id", warehouseIds)
    : { data: [], error: null };
  if (warehousesError) return fail(warehousesError.message, 500);
  const warehouseById = new Map((warehouseRows ?? []).map((warehouse) => [warehouse.id, warehouse as AssignmentWarehouse]));
  if (!warehouseById.has(operationalWarehouseId)) return fail("Kho vận hành của chặng không tồn tại", 400);
  if (auth.roleCode === RoleCode.DISPATCHER
    && !warehouseBelongsToScope(warehouseScope, warehouseById.get(operationalWarehouseId))) {
    return fail("Chặng này không thuộc tỉnh/kho phụ trách của bạn", 403);
  }

  const { data: staff, error: staffError } = await supabase
    .from("users")
    .select("id, role_id, status, province, warehouse_id")
    .eq("id", parsed.data.assigned_staff_id)
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
  if (staff.warehouse_id !== operationalWarehouseId) {
    return fail("Nhân viên giao hàng phải thuộc đúng kho vận hành của chặng", 400);
  }

  const nextAttemptNo = assignmentLeg.status === ShipmentLegStatusCode.FAILED
    ? Math.max(1, Number(assignmentLeg.attempt_no ?? 1) + 1)
    : Math.max(1, Number(assignmentLeg.attempt_no ?? 1));
  const legUpdate = {
    assigned_staff_id: staff.id,
    assigned_by: auth.userId,
    assigned_at: new Date().toISOString(),
    status: ShipmentLegStatusCode.ASSIGNED,
    attempt_no: nextAttemptNo,
    ...(assignmentLeg.status === ShipmentLegStatusCode.FAILED ? { started_at: null, completed_at: null } : {}),
  };
  const { data: updatedLeg, error: updateError } = await supabase
    .from("shipment_legs")
    .update(legUpdate)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return fail(updateError.message, 500);

  const { data: existingDelivery, error: existingDeliveryError } = await supabase
    .from("deliveries")
    .select("id")
    .eq("shipment_leg_id", id)
    .maybeSingle();
  if (existingDeliveryError) return fail(existingDeliveryError.message, 500);

  if (existingDelivery) {
    const { error } = await supabase
      .from("deliveries")
      .update({
        delivery_staff_id: staff.id,
        assigned_by: auth.userId,
        assigned_at: new Date().toISOString(),
      })
      .eq("id", existingDelivery.id);
    if (error) return fail(error.message, 500);
  } else {
    const { error } = await supabase.from("deliveries").insert({
      order_id: assignmentLeg.order_id,
      shipment_leg_id: id,
      delivery_staff_id: staff.id,
      assigned_by: auth.userId,
      is_return: assignmentLeg.is_return,
    });
    if (error) return fail(error.message, 500);
  }

  // Đơn chuyển sang ASSIGNED ngay khi chặng lấy hàng đã có shipper.
  // Các chặng TRANSFER không có shipper; nhân viên kho sẽ xử lý bằng
  // nghiệp vụ nhập/xuất kho nên không được dùng chúng làm điều kiện chặn.
  const { data: orderLegs, error: orderLegsError } = await supabase
    .from("shipment_legs")
    .select("leg_type, status, assigned_staff_id")
    .eq("order_id", assignmentLeg.order_id);
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
        .eq("id", assignmentLeg.order_id)
        .in("status_id", assignableStatuses.map((status) => status.id));
    }
  }

  return ok(updatedLeg);
}
