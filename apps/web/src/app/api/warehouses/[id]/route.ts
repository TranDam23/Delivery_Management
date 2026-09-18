import type { NextRequest } from "next/server";
import { z } from "zod";
import { geoPointFields, refineCoordinatePair, RoleCode, WarehouseLevelCode, WarehouseStatusCode } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { warehouseGeoChanges } from "@/lib/geo";
import { normalizeArea } from "@/lib/shipment-routing";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateWarehouseSchema = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  address_line: z.string().trim().min(2).max(255).optional(),
  ward: z.string().trim().max(120).nullable().optional(),
  district: z.string().trim().max(120).nullable().optional(),
  province: z.string().trim().min(2).max(120).optional(),
  capacity: z.number().int().nonnegative().nullable().optional(),
  status: z.enum([WarehouseStatusCode.ACTIVE, WarehouseStatusCode.INACTIVE]).optional(),
  warehouse_level: z.enum([WarehouseLevelCode.REGIONAL, WarehouseLevelCode.PROVINCE, WarehouseLevelCode.COMMUNE]).optional(),
  region_code: z.string().trim().max(40).nullable().optional(),
  ...geoPointFields,
}).superRefine(refineCoordinatePair);

function canManageWarehouses(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN;
}

/** PATCH /api/warehouses/:id — cập nhật hoặc vô hiệu hóa kho. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageWarehouses(auth.roleCode)) return fail("Forbidden", 403);

  const { id } = await params;
  const parsed = updateWarehouseSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return fail("Không có dữ liệu cập nhật");

  const supabase = getSupabaseServiceClient();
  const { data: current, error: currentError } = await supabase
    .from("warehouses")
    .select("id, ward, district, province, warehouse_level, parent_warehouse_id, region_code")
    .eq("id", id)
    .maybeSingle();
  if (currentError) return fail(currentError.message, 500);
  if (!current) return fail("Không tìm thấy kho", 404);

  const nextLevel = parsed.data.warehouse_level ?? current.warehouse_level;
  const nextProvince = parsed.data.province ?? current.province;
  const nextWard = parsed.data.ward !== undefined ? parsed.data.ward : current.ward;

  let parentWarehouseId: string | null = null;
  let regionCode: string | null = parsed.data.region_code !== undefined
    ? parsed.data.region_code?.trim() || null
    : current.region_code ?? null;

  if (nextLevel === WarehouseLevelCode.COMMUNE) {
    if (!nextWard?.trim()) return fail("Kho con phải có xã/phường", 400);
    const { data: parents, error: parentsError } = await supabase
      .from("warehouses")
      .select("id, province, region_code")
      .eq("warehouse_level", WarehouseLevelCode.PROVINCE)
      .eq("status", WarehouseStatusCode.ACTIVE)
      .neq("id", id);
    if (parentsError) return fail(parentsError.message, 500);
    const parent = (parents ?? []).find((item) => normalizeArea(item.province) === normalizeArea(nextProvince));
    parentWarehouseId = parent?.id ?? null;
    regionCode = parent?.region_code ?? regionCode;
    if (!parentWarehouseId) return fail("Tỉnh/thành phố chưa có kho cha đang hoạt động", 400);
  } else if (nextLevel === WarehouseLevelCode.PROVINCE) {
    const { data: provinceWarehouses, error: provinceWarehousesError } = await supabase
      .from("warehouses")
      .select("id, province, parent_warehouse_id, region_code")
      .eq("warehouse_level", WarehouseLevelCode.PROVINCE)
      .eq("status", WarehouseStatusCode.ACTIVE)
      .neq("id", id);
    if (provinceWarehousesError) return fail(provinceWarehousesError.message, 500);
    const matchingProvince = (provinceWarehouses ?? []).find(
      (item) => normalizeArea(item.province) === normalizeArea(nextProvince) && item.parent_warehouse_id,
    );
    parentWarehouseId = matchingProvince?.parent_warehouse_id ?? current.parent_warehouse_id ?? null;
    regionCode = matchingProvince?.region_code ?? regionCode;
    if (!parentWarehouseId) return fail("Tỉnh/thành phố chưa được gắn với trung tâm khai thác vùng", 400);
  } else if (nextLevel === WarehouseLevelCode.REGIONAL) {
    if (!regionCode) return fail("Trung tâm vùng phải có mã vùng", 400);
    parentWarehouseId = null;
  }

  const payload = {
    ...parsed.data,
    ...(parsed.data.code ? { code: parsed.data.code.toUpperCase() } : {}),
    warehouse_level: nextLevel,
    parent_warehouse_id: parentWarehouseId,
    region_code: regionCode,
    ward: nextLevel === WarehouseLevelCode.PROVINCE || nextLevel === WarehouseLevelCode.REGIONAL ? null : nextWard || null,
    district: nextLevel === WarehouseLevelCode.PROVINCE || nextLevel === WarehouseLevelCode.REGIONAL ? null : (parsed.data.district !== undefined ? parsed.data.district || null : current.district),
    ...warehouseGeoChanges(parsed.data),
  };
  const { data, error } = await supabase.from("warehouses").update(payload).eq("id", id).select("*").maybeSingle();
  if (error) {
    if (error.code === "23505") return fail("Mã kho đã tồn tại", 409);
    return fail(error.message, 500);
  }
  return ok(data);
}
