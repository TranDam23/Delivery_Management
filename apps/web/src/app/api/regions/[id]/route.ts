import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { invalidateAreaCatalogCache } from "@/lib/area-catalog";
import { normalizeArea } from "@/lib/shipment-routing";
import {
  areaDb,
  canViewAreas,
  countAreaUsage,
  dispatcherProvince,
  normalizeAreaName,
  rootProvinceName,
  type AdministrativeArea,
} from "@/lib/administrative-areas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).refine((value) => value.name !== undefined || value.status !== undefined, "Không có thay đổi nào");

/** Trả về khu vực nếu người dùng có quyền quản lý nó, ngược lại trả lỗi. */
async function loadManageable(request: NextRequest, id: string): Promise<
  | { area: AdministrativeArea; userId: string }
  | { error: ReturnType<typeof fail> }
> {
  const auth = getAuthFromRequest(request);
  if (!auth) return { error: fail("Unauthorized", 401) };
  if (!canViewAreas(auth.roleCode)) return { error: fail("Forbidden", 403) };

  const { data, error } = await areaDb().from("administrative_areas").select("*").eq("id", id).maybeSingle();
  if (error) return { error: fail(error.message, 500) };
  if (!data) return { error: fail("Không tìm thấy khu vực", 404) };
  const area = data as AdministrativeArea;

  if (auth.roleCode === RoleCode.DISPATCHER) {
    if (area.level === "PROVINCE") return { error: fail("Chỉ Admin được quản lý tỉnh/thành phố", 403) };
    const scope = await dispatcherProvince(auth);
    if (scope.error) return { error: fail(scope.error, 500) };
    const province = await rootProvinceName(area);
    if (!scope.province || !province || normalizeArea(province) !== normalizeArea(scope.province)) {
      return { error: fail("Bạn chỉ được quản lý khu vực thuộc tỉnh/thành phố phụ trách", 403) };
    }
  }
  return { area, userId: auth.userId };
}

/** PATCH /api/regions/:id — đổi tên (khi chưa dùng) hoặc tạm dừng/kích hoạt khu vực. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const loaded = await loadManageable(request, id);
  if ("error" in loaded) return loaded.error;
  const { area } = loaded;

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Dữ liệu cập nhật không hợp lệ", 400);

  const patch: { name?: string; status?: string } = {};
  const nextName = parsed.data.name === undefined ? undefined : normalizeAreaName(parsed.data.name);
  if (nextName !== undefined && nextName !== area.name) {
    // Tên khu vực được lưu dạng text trong kho/địa chỉ, nên chỉ đổi tên khi chưa có dữ liệu nào dùng.
    const usage = await countAreaUsage(area).catch((caught: unknown) => caught as Error);
    if (usage instanceof Error) return fail(usage.message, 500);
    if (usage.warehouses > 0 || usage.addresses > 0) {
      return fail(`Không thể đổi tên: đang có ${usage.warehouses} kho và ${usage.addresses} địa chỉ dùng khu vực này. Hãy tạm dừng khu vực thay vì đổi tên.`, 409);
    }
    patch.name = nextName;
  }
  if (parsed.data.status !== undefined && parsed.data.status !== area.status) patch.status = parsed.data.status;
  if (Object.keys(patch).length === 0) return ok(area);

  const { data, error } = await areaDb().from("administrative_areas").update(patch).eq("id", id).select("*").single();
  if (error) {
    if (error.code === "23505") return fail("Tên khu vực đã tồn tại trong cùng cấp cha", 409);
    return fail(error.message, 500);
  }

  invalidateAreaCatalogCache();
  await writeAuditLog({
    userId: loaded.userId,
    action: "AREA_UPDATE",
    entityType: "administrative_area",
    entityId: id,
    oldData: area,
    newData: data,
    request,
  });
  return ok(data);
}

/** DELETE /api/regions/:id — xóa khu vực khi không còn khu vực con và không có kho/địa chỉ dùng. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const loaded = await loadManageable(request, id);
  if ("error" in loaded) return loaded.error;
  const { area } = loaded;

  const { count, error: childError } = await areaDb()
    .from("administrative_areas")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);
  if (childError) return fail(childError.message, 500);
  if ((count ?? 0) > 0) return fail(`Không thể xóa: còn ${count} khu vực con. Hãy xóa hoặc tạm dừng các khu vực con trước.`, 409);

  const usage = await countAreaUsage(area).catch((caught: unknown) => caught as Error);
  if (usage instanceof Error) return fail(usage.message, 500);
  if (usage.warehouses > 0 || usage.addresses > 0) {
    return fail(`Không thể xóa: đang có ${usage.warehouses} kho và ${usage.addresses} địa chỉ dùng khu vực này. Hãy tạm dừng khu vực thay vì xóa.`, 409);
  }

  const { error } = await areaDb().from("administrative_areas").delete().eq("id", id);
  if (error) return fail(error.code === "23503" ? "Không thể xóa: còn khu vực con" : error.message, error.code === "23503" ? 409 : 500);

  invalidateAreaCatalogCache();
  await writeAuditLog({
    userId: loaded.userId,
    action: "AREA_DELETE",
    entityType: "administrative_area",
    entityId: id,
    oldData: area,
    request,
  });
  return ok({ id });
}
