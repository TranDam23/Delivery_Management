import { RoleCode, WarehouseLevelCode, WarehouseStatusCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** Vai trò vận hành phải gắn với một kho; các vai trò khác thì không. */
export const OPERATIONAL_ROLE_CODES: readonly string[] = [RoleCode.DISPATCHER, RoleCode.DELIVERY_STAFF, RoleCode.WAREHOUSE_STAFF];

export interface WarehouseAssignment {
  province: string | null;
  error: string | null;
  status: number;
}

/** Kiểm tra kho được gán hợp lệ với vai trò và trả về tỉnh phụ trách đồng bộ theo kho. */
export async function resolveWarehouseAssignment(roleCode: string, warehouseId: string | null): Promise<WarehouseAssignment> {
  if (!warehouseId) return { province: null, error: null, status: 200 };
  const { data: warehouse, error } = await getSupabaseServiceClient()
    .from("warehouses")
    .select("id, province, status, warehouse_level")
    .eq("id", warehouseId)
    .maybeSingle();
  if (error) return { province: null, error: error.message, status: 500 };
  if (!warehouse || warehouse.status !== WarehouseStatusCode.ACTIVE) {
    return { province: null, error: "Kho không tồn tại hoặc đang tạm dừng", status: 400 };
  }
  if (roleCode === RoleCode.DISPATCHER
    && warehouse.warehouse_level !== WarehouseLevelCode.COMMUNE
    && warehouse.warehouse_level !== WarehouseLevelCode.PROVINCE) {
    return { province: null, error: "Điều phối viên phải được gán vào kho con hoặc kho cha cấp tỉnh", status: 400 };
  }
  if (roleCode === RoleCode.DELIVERY_STAFF && warehouse.warehouse_level !== WarehouseLevelCode.COMMUNE) {
    return { province: null, error: "Nhân viên giao nhận phải được gán vào kho con cấp xã/phường", status: 400 };
  }
  return { province: warehouse.province, error: null, status: 200 };
}
