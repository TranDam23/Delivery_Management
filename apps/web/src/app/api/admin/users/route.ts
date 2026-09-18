import type { NextRequest } from "next/server";
import { RoleCode, WarehouseStatusCode } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

function canManageUsers(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN;
}

/** GET /api/admin/users — tài khoản nghiệp vụ và danh mục kho để Admin gán phạm vi. */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageUsers(auth.roleCode)) return fail("Forbidden", 403);

  const supabase = getSupabaseServiceClient();
  const [{ data: users, error: usersError }, { data: warehouses, error: warehousesError }] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, email, phone, province, warehouse_id, status, roles(code, name), warehouses(id, code, name, province, warehouse_level)")
      .order("full_name"),
    supabase
      .from("warehouses")
      .select("id, code, name, province, ward, district, status, warehouse_level, parent_warehouse_id, region_code")
      .eq("status", WarehouseStatusCode.ACTIVE)
      .order("province")
      .order("warehouse_level")
      .order("name"),
  ]);

  if (usersError) return fail(usersError.message, 500);
  if (warehousesError) return fail(warehousesError.message, 500);

  return ok({ users: users ?? [], warehouses: warehouses ?? [] });
}
