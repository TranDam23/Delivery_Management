import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode, ShipmentLegType } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
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

function assignmentDatabaseFailure(context: string) {
  console.error(`Delivery assignment query failed: ${context}`);
  return fail("Không thể xử lý phân công giao hàng", 500);
}

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
  if (warehouseScope.error) return assignmentDatabaseFailure("operational scope");
  if (auth.roleCode === RoleCode.DISPATCHER && !warehouseScope.warehouseId) {
    return fail("Tài khoản điều phối viên chưa được gán kho phụ trách", 409);
  }

  const { data: leg, error: legError } = await supabase
    .from("shipment_legs")
    .select("id, order_id, sequence_no, leg_type, from_warehouse_id, to_warehouse_id, responsibility_province, status, attempt_no, is_return, assigned_staff_id, updated_at")
    .eq("id", parsed.data.shipment_leg_id)
    .eq("order_id", parsed.data.order_id)
    .maybeSingle();
  if (legError) return assignmentDatabaseFailure("shipment leg");
  if (!leg) return fail("Chặng vận chuyển không tồn tại hoặc không thuộc đơn hàng", 404);
  const assignable = await checkLegAssignable(supabase, leg);
  if (assignable.error) {
    if (assignable.status >= 500) return assignmentDatabaseFailure("shipment leg rules");
    return fail(assignable.error, assignable.status);
  }

  const operationalWarehouseId = leg.leg_type === ShipmentLegType.PICKUP
    ? leg.to_warehouse_id
    : leg.from_warehouse_id;
  if (!operationalWarehouseId) return fail("Chặng chưa được gắn kho vận hành", 400);
  const { data: staff, error: staffError } = await supabase
    .from("users")
    .select("id, role_id, status, province, warehouse_id")
    .eq("id", parsed.data.delivery_staff_id)
    .maybeSingle();
  if (staffError) return assignmentDatabaseFailure("delivery staff");
  if (!staff || staff.status !== "active") return fail("Nhân viên không tồn tại hoặc không hoạt động", 404);

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("code")
    .eq("id", staff.role_id)
    .maybeSingle();
  if (roleError) return assignmentDatabaseFailure("delivery staff role");
  if (!role || role.code !== RoleCode.DELIVERY_STAFF) {
    return fail("Chỉ nhân viên giao hàng mới được phân công vào chặng", 400);
  }
  const { data: operationalWarehouse, error: operationalWarehouseError } = await supabase
    .from("warehouses")
    .select("id, province, warehouse_level")
    .eq("id", operationalWarehouseId)
    .maybeSingle();
  if (operationalWarehouseError) return assignmentDatabaseFailure("operational warehouse");
  if (!operationalWarehouse) return fail("Kho vận hành của chặng không tồn tại", 400);
  if (auth.roleCode === RoleCode.DISPATCHER
    && !warehouseBelongsToScope(warehouseScope, operationalWarehouse)) {
    return fail("Chặng này không thuộc tỉnh/kho phụ trách của bạn", 403);
  }
  if (staff.warehouse_id !== operationalWarehouseId) {
    return fail("Nhân viên giao hàng phải thuộc đúng kho vận hành của chặng", 400);
  }

  const { data: delivery, error } = await supabase.rpc("assign_delivery_atomic", {
    p_order_id: parsed.data.order_id,
    p_shipment_leg_id: leg.id,
    p_delivery_staff_id: staff.id,
    p_assigned_by: auth.userId,
    p_assigned_at: new Date().toISOString(),
    p_expected_updated_at: leg.updated_at,
    p_expected_status: leg.status,
    p_expected_assigned_staff_id: leg.assigned_staff_id,
  });
  if (error) {
    const conflictMessages: Record<string, string> = {
      LEG_NOT_ASSIGNABLE: "Không thể phân công chặng đã kết thúc",
      LEG_IN_PROGRESS: "Chặng đang được thực hiện, không thể đổi người phụ trách",
      TRANSFER_NOT_ASSIGNABLE: "Chặng trung chuyển do nhân viên kho xác nhận nhập/xuất, không phân công shipper",
      MAX_ATTEMPTS_REACHED: "Đơn hàng đã đạt số lần giao tối đa và được chuyển sang tuyến hoàn hàng",
      WAREHOUSE_INBOUND_REQUIRED: "Kho phát chưa xác nhận nhận lại hàng sau lần giao thất bại, chưa thể phân công giao lại",
      PREVIOUS_LEG_NOT_READY: "Hàng chưa đến kho phát, chưa thể phân công chặng giao cuối",
      FAILED_DELIVERY_NOT_FOUND: "Không tìm thấy bản ghi giao hàng của chặng thất bại",
      LEG_CHANGED: "Chặng đã được cập nhật bởi yêu cầu khác; hãy tải lại trước khi phân công",
    };
    const message = conflictMessages[error.message];
    if (message) return fail(message, 409);
    if (error.message === "LEG_NOT_FOUND") return fail("Chặng vận chuyển không tồn tại hoặc không thuộc đơn hàng", 404);
    if (error.message === "STAFF_NOT_FOUND" || error.message === "STAFF_INACTIVE") return fail("Nhân viên không tồn tại hoặc không hoạt động", 404);
    if (error.message === "STAFF_ROLE_INVALID") return fail("Chỉ nhân viên giao hàng mới được phân công vào chặng", 400);
    if (error.message === "STAFF_WAREHOUSE_MISMATCH") return fail("Nhân viên giao hàng phải thuộc đúng kho vận hành của chặng", 400);
    if (error.message === "WAREHOUSE_NOT_FOUND") return fail("Kho vận hành của chặng không tồn tại", 400);
    return assignmentDatabaseFailure(`atomic RPC (${error.code ?? "unknown"})`);
  }
  if (!delivery) {
    return assignmentDatabaseFailure("atomic RPC returned no delivery");
  }

  await writeAuditLog({ userId: auth.userId, action: "DELIVERY_ASSIGNED", entityType: "order", entityId: parsed.data.order_id, newData: { shipment_leg_id: leg.id, delivery_staff_id: staff.id, leg_type: leg.leg_type }, request });
  return ok(delivery, 201);
}
