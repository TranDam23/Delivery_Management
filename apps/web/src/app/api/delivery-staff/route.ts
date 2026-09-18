import { RoleCode } from "@delivery/shared";
import type { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getUserOperationalScope } from "@/lib/dispatcher-scope";
import { normalizeArea } from "@/lib/shipment-routing";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** GET /api/delivery-staff — danh sách nhân viên giao hàng đang hoạt động. */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DISPATCHER) {
    return fail("Forbidden", 403);
  }

  const warehouseScope = await getUserOperationalScope(auth);
  if (warehouseScope.error) return fail(warehouseScope.error, 500);
  if (auth.roleCode === RoleCode.DISPATCHER && !warehouseScope.warehouseId) return ok([]);

  const supabase = getSupabaseServiceClient();
  const { data: roles, error: rolesError } = await supabase.from("roles").select("id").eq("code", RoleCode.DELIVERY_STAFF).maybeSingle();
  if (rolesError) return fail(rolesError.message, 500);
  if (!roles) return ok([]);

  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, phone, province, warehouse_id, warehouses(code, name, province)")
    .eq("role_id", roles.id)
    .eq("status", "active")
    .order("full_name");
  if (error) return fail(error.message, 500);
  const visibleStaff = auth.roleCode === RoleCode.DISPATCHER && warehouseScope.warehouseId
    ? (data ?? []).filter((member) => {
        if (warehouseScope.warehouseLevel !== "PROVINCE") {
          return member.warehouse_id === warehouseScope.warehouseId;
        }
        const memberWarehouse = Array.isArray(member.warehouses) ? member.warehouses[0] : member.warehouses;
        return normalizeArea(memberWarehouse?.province ?? member.province) === normalizeArea(warehouseScope.province);
      })
    : data ?? [];
  return ok(visibleStaff.map((member) => {
    const memberWarehouse = Array.isArray(member.warehouses) ? member.warehouses[0] : member.warehouses;
    return {
      id: member.id,
      full_name: member.full_name,
      phone: member.phone,
      warehouse_id: member.warehouse_id,
      warehouse: memberWarehouse ? { code: memberWarehouse.code, name: memberWarehouse.name } : null,
    };
  }));
}
