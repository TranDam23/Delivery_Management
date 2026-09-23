import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode, WarehouseLevelCode, WarehouseStatusCode } from "@delivery/shared";
import { adminUserDetailController } from "@/controllers/admin-user-detail.controller";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const assignmentSchema = z.object({
  warehouse_id: z.string().uuid().nullable(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return adminUserDetailController(request, id);
}

/** PATCH /api/admin/users/:id — gán hoặc bỏ gán kho cho tài khoản vận hành. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);

  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message);

  const { id } = await params;
  const supabase = getSupabaseServiceClient();
  const { data: target, error: targetError } = await supabase
    .from("users")
    .select("id, role_id, roles(code)")
    .eq("id", id)
    .maybeSingle();
  if (targetError) return fail(targetError.message, 500);
  if (!target) return fail("Không tìm thấy tài khoản", 404);

  const role = Array.isArray(target.roles) ? target.roles[0] : target.roles;
  const operationalRoles = [RoleCode.DISPATCHER, RoleCode.DELIVERY_STAFF, RoleCode.WAREHOUSE_STAFF] as string[];
  if (!role || !operationalRoles.includes(role.code)) {
    return fail("Chỉ tài khoản điều phối viên, nhân viên giao nhận hoặc nhân viên kho mới được gán kho", 400);
  }

  let province: string | null = null;
  if (parsed.data.warehouse_id) {
    const { data: warehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id, province, status, warehouse_level")
      .eq("id", parsed.data.warehouse_id)
      .maybeSingle();
    if (warehouseError) return fail(warehouseError.message, 500);
    if (!warehouse || warehouse.status !== WarehouseStatusCode.ACTIVE) {
      return fail("Kho không tồn tại hoặc đang tạm dừng", 400);
    }
    if (role.code === RoleCode.DISPATCHER
      && warehouse.warehouse_level !== WarehouseLevelCode.COMMUNE
      && warehouse.warehouse_level !== WarehouseLevelCode.PROVINCE) {
      return fail("Điều phối viên phải được gán vào kho con hoặc kho cha cấp tỉnh", 400);
    }
    if (role.code === RoleCode.DELIVERY_STAFF
      && warehouse.warehouse_level !== WarehouseLevelCode.COMMUNE) {
      return fail("Nhân viên giao nhận phải được gán vào kho con cấp xã/phường", 400);
    }
    province = warehouse.province;
  }

  const { data, error } = await supabase
    .from("users")
    .update({ warehouse_id: parsed.data.warehouse_id, province })
    .eq("id", id)
    .select("id, full_name, email, phone, province, warehouse_id, status, roles(code, name), warehouses(id, code, name, province, warehouse_level)")
    .single();
  if (error) return fail(error.message, 500);
  return ok(data);
}
