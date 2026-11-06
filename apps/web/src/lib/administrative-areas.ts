import { RoleCode, type AuthTokenPayload } from "@delivery/shared";
import { getUserOperationalScope } from "@/lib/dispatcher-scope";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export type AreaLevel = "PROVINCE" | "DISTRICT" | "WARD";
export type AreaStatus = "active" | "inactive";

export interface AdministrativeArea {
  id: string;
  level: AreaLevel;
  name: string;
  parent_id: string | null;
  status: AreaStatus;
  created_at: string;
  updated_at: string;
}

export function areaDb(): ReturnType<typeof getSupabaseServiceClient> {
  return getSupabaseServiceClient();
}

export function normalizeAreaName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function canViewAreas(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.DISPATCHER;
}

/** Tên các cấp từ tỉnh đến chính khu vực đó, dùng để đối chiếu với kho/địa chỉ. */
export async function resolveAreaPath(area: AdministrativeArea): Promise<{ province: string; district?: string; ward?: string } | null> {
  const chain: AdministrativeArea[] = [area];
  let parentId = area.parent_id;
  while (parentId) {
    const { data, error } = await areaDb().from("administrative_areas").select("*").eq("id", parentId).maybeSingle();
    if (error || !data) return null;
    chain.unshift(data as AdministrativeArea);
    parentId = (data as AdministrativeArea).parent_id;
  }
  const nameOf = (level: AreaLevel): string | undefined => chain.find((item) => item.level === level)?.name;
  const province = nameOf("PROVINCE");
  if (!province) return null;
  return { province, district: nameOf("DISTRICT"), ward: nameOf("WARD") };
}

/** Số kho và địa chỉ khách hàng đang dùng đúng tên khu vực này (và các cấp con của nó). */
export async function countAreaUsage(area: AdministrativeArea): Promise<{ warehouses: number; addresses: number }> {
  const path = await resolveAreaPath(area);
  if (!path) return { warehouses: 0, addresses: 0 };
  const db = getSupabaseServiceClient();

  let warehouseQuery = db.from("warehouses").select("id", { count: "exact", head: true }).eq("province", path.province);
  let addressQuery = db.from("addresses").select("id", { count: "exact", head: true }).eq("province", path.province);
  if (path.district) {
    warehouseQuery = warehouseQuery.eq("district", path.district);
    addressQuery = addressQuery.eq("district", path.district);
  }
  if (path.ward) {
    warehouseQuery = warehouseQuery.eq("ward", path.ward);
    addressQuery = addressQuery.eq("ward", path.ward);
  }
  const [warehouses, addresses] = await Promise.all([warehouseQuery, addressQuery]);
  if (warehouses.error) throw new Error(warehouses.error.message);
  if (addresses.error) throw new Error(addresses.error.message);
  return { warehouses: warehouses.count ?? 0, addresses: addresses.count ?? 0 };
}

/** Tỉnh mà điều phối viên được phép quản lý quận/phường; null nghĩa là chưa được gán kho. */
export async function dispatcherProvince(auth: AuthTokenPayload): Promise<{ province: string | null; error: string | null }> {
  const scope = await getUserOperationalScope(auth);
  return { province: scope.province, error: scope.error };
}

/** Tỉnh gốc của một khu vực (chính nó nếu là tỉnh). */
export async function rootProvinceName(area: AdministrativeArea): Promise<string | null> {
  return (await resolveAreaPath(area))?.province ?? null;
}
