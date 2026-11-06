import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { normalizeArea } from "@/lib/shipment-routing";
import {
  areaDb,
  canViewAreas,
  dispatcherProvince,
  normalizeAreaName,
  rootProvinceName,
  type AdministrativeArea,
} from "@/lib/administrative-areas";

const createSchema = z.object({
  level: z.enum(["PROVINCE", "DISTRICT", "WARD"]),
  name: z.string().trim().min(1).max(120),
  parent_id: z.string().uuid().nullable().optional(),
});

async function loadAllAreas(): Promise<AdministrativeArea[]> {
  const pageSize = 1000;
  const rows: AdministrativeArea[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await areaDb()
      .from("administrative_areas")
      .select("*")
      .order("name")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as AdministrativeArea[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/**
 * GET /api/regions — toàn bộ cây khu vực (phẳng, có parent_id) kèm số kho đang dùng.
 * Điều phối viên chỉ thấy tỉnh được phân công.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canViewAreas(auth.roleCode)) return fail("Forbidden", 403);

  try {
    let areas = await loadAllAreas();
    if (auth.roleCode === RoleCode.DISPATCHER) {
      const scope = await dispatcherProvince(auth);
      if (scope.error) return fail(scope.error, 500);
      if (!scope.province) return ok({ items: [], canManageProvinces: false });
      const provinceKey = normalizeArea(scope.province);
      const root = areas.find((area) => area.level === "PROVINCE" && normalizeArea(area.name) === provinceKey);
      if (!root) return ok({ items: [], canManageProvinces: false });
      const districts = areas.filter((area) => area.parent_id === root.id);
      const districtIds = new Set(districts.map((area) => area.id));
      areas = [root, ...districts, ...areas.filter((area) => area.level === "WARD" && area.parent_id && (area.parent_id === root.id || districtIds.has(area.parent_id)))];
    }

    const { data: warehouses, error } = await areaDb().from("warehouses").select("province, district, ward");
    if (error) return fail(error.message, 500);
    const counts = new Map<string, number>();
    for (const row of (warehouses ?? []) as Array<{ province: string | null; district: string | null; ward: string | null }>) {
      const province = normalizeArea(row.province);
      const district = normalizeArea(row.district);
      const ward = normalizeArea(row.ward);
      if (province) counts.set(province, (counts.get(province) ?? 0) + 1);
      const bump = (key: string): void => { counts.set(key, (counts.get(key) ?? 0) + 1); };
      if (province && district) bump(`${province}|${district}`);
      if (province && ward) bump([province, district, ward].filter(Boolean).join("|"));
    }

    const byId = new Map(areas.map((area) => [area.id, area]));
    const keyOf = (area: AdministrativeArea): string => {
      const parts = [normalizeArea(area.name)];
      let parent = area.parent_id ? byId.get(area.parent_id) : undefined;
      while (parent) {
        parts.unshift(normalizeArea(parent.name));
        parent = parent.parent_id ? byId.get(parent.parent_id) : undefined;
      }
      return parts.join("|");
    };

    return ok({
      canManageProvinces: auth.roleCode === RoleCode.ADMIN,
      items: areas.map((area) => ({ ...area, warehouse_count: counts.get(keyOf(area)) ?? 0 })),
    });
  } catch (caught) {
    return fail(caught instanceof Error ? caught.message : "Không đọc được danh mục khu vực", 500);
  }
}

/** POST /api/regions — thêm tỉnh (Admin) hoặc quận/phường (Admin, điều phối viên trong tỉnh phụ trách). */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canViewAreas(auth.roleCode)) return fail("Forbidden", 403);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Dữ liệu khu vực không hợp lệ", 400);
  const { level } = parsed.data;
  const name = normalizeAreaName(parsed.data.name);
  const parentId = parsed.data.parent_id ?? null;

  if (level === "PROVINCE") {
    if (auth.roleCode !== RoleCode.ADMIN) return fail("Chỉ Admin được thêm tỉnh/thành phố", 403);
    if (parentId) return fail("Tỉnh/thành phố không có cấp cha", 400);
  } else {
    if (!parentId) return fail("Thiếu khu vực cấp cha", 400);
    const { data: parent, error } = await areaDb().from("administrative_areas").select("*").eq("id", parentId).maybeSingle();
    if (error) return fail(error.message, 500);
    if (!parent) return fail("Không tìm thấy khu vực cấp cha", 404);
    const parentLevel = (parent as AdministrativeArea).level;
    const parentOk = level === "DISTRICT" ? parentLevel === "PROVINCE" : parentLevel === "PROVINCE" || parentLevel === "DISTRICT";
    if (!parentOk) {
      return fail(level === "DISTRICT" ? "Quận/huyện phải thuộc một tỉnh/thành phố" : "Phường/xã phải thuộc một tỉnh/thành phố hoặc quận/huyện", 400);
    }
    if (auth.roleCode === RoleCode.DISPATCHER) {
      const scope = await dispatcherProvince(auth);
      if (scope.error) return fail(scope.error, 500);
      const provinceName = await rootProvinceName(parent as AdministrativeArea);
      if (!scope.province || !provinceName || normalizeArea(provinceName) !== normalizeArea(scope.province)) {
        return fail("Bạn chỉ được quản lý khu vực thuộc tỉnh/thành phố phụ trách", 403);
      }
    }
  }

  const { data, error } = await areaDb()
    .from("administrative_areas")
    .insert({ level, name, parent_id: parentId })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return fail("Khu vực này đã tồn tại", 409);
    return fail(error.message, 500);
  }

  await writeAuditLog({
    userId: auth.userId,
    action: "AREA_CREATE",
    entityType: "administrative_area",
    entityId: (data as AdministrativeArea).id,
    newData: data,
    request,
  });
  return ok(data, 201);
}
