import { RoleCode, WarehouseLevelCode, type AuthTokenPayload } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { normalizeArea } from "@/lib/shipment-routing";

export interface DispatcherProvinceScope {
  province: string | null;
  error: string | null;
}

export interface UserWarehouseScope {
  warehouseId: string | null;
  province: string | null;
  warehouseLevel: string | null;
  error: string | null;
}

export interface OperationalWarehouseScope {
  warehouseId: string | null;
  province: string | null;
  warehouseLevel: string | null;
  error: string | null;
}

/** Đọc tỉnh phụ trách hiện tại từ database, không tin vào dữ liệu trong JWT. */
export async function getDispatcherProvince(auth: AuthTokenPayload): Promise<DispatcherProvinceScope> {
  if (auth.roleCode !== RoleCode.DISPATCHER) return { province: null, error: null };

  const { data, error } = await getSupabaseServiceClient()
    .from("users")
    .select("province")
    .eq("id", auth.userId)
    .maybeSingle();

  if (error) return { province: null, error: error.message };

  const province = typeof data?.province === "string" ? data.province.trim() : "";
  return { province: province || null, error: null };
}

/** Đọc kho vận hành được Admin gán; không lấy phạm vi này từ JWT/client. */
export async function getUserWarehouseId(auth: AuthTokenPayload): Promise<UserWarehouseScope> {
  const scope = await getUserOperationalScope(auth);
  return {
    warehouseId: scope.warehouseId,
    province: scope.province,
    warehouseLevel: scope.warehouseLevel,
    error: scope.error,
  };
}

/**
 * Đọc phạm vi vận hành từ database.
 *
 * Điều phối viên có thể được gán vào kho con (chỉ điều phối một điểm) hoặc
 * kho cha cấp tỉnh (điều phối toàn bộ kho con trong tỉnh). Nhân viên kho và
 * nhân viên giao nhận vẫn bị giới hạn ở đúng kho được Admin gán.
 */
export async function getUserOperationalScope(auth: AuthTokenPayload): Promise<OperationalWarehouseScope> {
  if (auth.roleCode !== RoleCode.DISPATCHER
    && auth.roleCode !== RoleCode.WAREHOUSE_STAFF
    && auth.roleCode !== RoleCode.DELIVERY_STAFF) {
    return { warehouseId: null, province: null, warehouseLevel: null, error: null };
  }

  const { data, error } = await getSupabaseServiceClient()
    .from("users")
    .select("province, warehouse_id, warehouses(id, province, warehouse_level, status)")
    .eq("id", auth.userId)
    .maybeSingle();

  if (error) return { warehouseId: null, province: null, warehouseLevel: null, error: error.message };

  const warehouseId = typeof data?.warehouse_id === "string" ? data.warehouse_id.trim() : "";
  const relation = Array.isArray(data?.warehouses) ? data.warehouses[0] : data?.warehouses;
  if (relation?.status && relation.status !== "active") {
    return {
      warehouseId: null,
      province: null,
      warehouseLevel: null,
      error: "Kho phụ trách đang tạm dừng, tài khoản chưa thể thao tác",
    };
  }
  const province = typeof relation?.province === "string" && relation.province.trim()
    ? relation.province.trim()
    : typeof data?.province === "string" && data.province.trim()
      ? data.province.trim()
      : null;
  const warehouseLevel = typeof relation?.warehouse_level === "string"
    ? relation.warehouse_level
    : null;

  return {
    warehouseId: warehouseId || null,
    province,
    warehouseLevel,
    error: null,
  };
}

export interface ScopeWarehouse {
  id: string;
  province: string | null;
  warehouse_level?: string | null;
}

/** Kiểm tra một kho có nằm trong phạm vi tài khoản hay không. */
export function warehouseBelongsToScope(
  scope: OperationalWarehouseScope,
  warehouse: ScopeWarehouse | null | undefined,
): boolean {
  if (!scope.warehouseId || !warehouse) return false;
  if (scope.warehouseLevel === WarehouseLevelCode.PROVINCE && scope.province) {
    return normalizeArea(scope.province) === normalizeArea(warehouse.province);
  }
  return warehouse.id === scope.warehouseId;
}
