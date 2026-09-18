import type { NextRequest } from "next/server";
import { z } from "zod";
import { geoPointFields, refineCoordinatePair, RoleCode, WarehouseLevelCode, WarehouseStatusCode } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getUserOperationalScope, warehouseBelongsToScope } from "@/lib/dispatcher-scope";
import { warehouseGeoColumns } from "@/lib/geo";
import { normalizeArea } from "@/lib/shipment-routing";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const warehouseSchema = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, "Mã kho chỉ được chứa chữ, số, _ hoặc -"),
  name: z.string().trim().min(2).max(120),
  address_line: z.string().trim().min(2).max(255),
  ward: z.string().trim().max(120).nullable().optional(),
  district: z.string().trim().max(120).nullable().optional(),
  province: z.string().trim().min(2).max(120),
  capacity: z.number().int().nonnegative().nullable().optional(),
  status: z.enum([WarehouseStatusCode.ACTIVE, WarehouseStatusCode.INACTIVE]).default(WarehouseStatusCode.ACTIVE),
  warehouse_level: z.enum([WarehouseLevelCode.REGIONAL, WarehouseLevelCode.PROVINCE, WarehouseLevelCode.COMMUNE]).default(WarehouseLevelCode.COMMUNE),
  region_code: z.string().trim().max(40).nullable().optional(),
  ...geoPointFields,
}).superRefine((value, context) => {
  refineCoordinatePair(value, context);
  if (value.warehouse_level === WarehouseLevelCode.COMMUNE && !value.ward?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ward"], message: "Kho con phải có xã/phường" });
  }
  if (value.warehouse_level === WarehouseLevelCode.REGIONAL && !value.region_code?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["region_code"], message: "Trung tâm vùng phải có mã vùng" });
  }
});

function canViewWarehouses(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.DISPATCHER || roleCode === RoleCode.WAREHOUSE_STAFF;
}

function canManageWarehouses(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN;
}

async function findProvinceParent(province: string): Promise<{ id: string; region_code: string | null } | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, province, region_code")
    .eq("warehouse_level", WarehouseLevelCode.PROVINCE)
    .eq("status", WarehouseStatusCode.ACTIVE);
  if (error) throw new Error(error.message);

  const normalizedProvince = normalizeArea(province);
  return (data ?? []).find((warehouse) => normalizeArea(warehouse.province) === normalizedProvince) ?? null;
}

async function findRegionalParent(province: string): Promise<{ id: string; region_code: string | null } | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, province, parent_warehouse_id, region_code")
    .eq("warehouse_level", WarehouseLevelCode.PROVINCE)
    .eq("status", WarehouseStatusCode.ACTIVE);
  if (error) throw new Error(error.message);

  const normalizedProvince = normalizeArea(province);
  const provinceWarehouse = (data ?? []).find(
    (warehouse) => normalizeArea(warehouse.province) === normalizedProvince && warehouse.parent_warehouse_id,
  );
  if (!provinceWarehouse?.parent_warehouse_id) return null;
  return { id: provinceWarehouse.parent_warehouse_id, region_code: provinceWarehouse.region_code ?? null };
}

/** GET /api/warehouses — danh sách kho theo phạm vi vận hành của tài khoản. */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canViewWarehouses(auth.roleCode)) return fail("Forbidden", 403);

  const warehouseScope = await getUserOperationalScope(auth);
  if (warehouseScope.error) return fail(warehouseScope.error, 500);
  if ((auth.roleCode === RoleCode.DISPATCHER || auth.roleCode === RoleCode.WAREHOUSE_STAFF) && !warehouseScope.warehouseId) return ok([]);

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";
  const supabase = getSupabaseServiceClient();
  const pageSize = 1000;
  const warehouses = [];

  // Supabase/PostgREST có thể giới hạn số dòng trả về trong một request.
  // Đọc tuần tự theo trang để không bỏ mất các kho sau dòng thứ 1.000.
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("warehouses")
      .select("*")
      .order("province")
      .order("district")
      .order("name")
      .range(from, from + pageSize - 1);
    if (activeOnly) query = query.eq("status", WarehouseStatusCode.ACTIVE);

    const { data, error } = await query;
    if (error) return fail(error.message, 500);

    warehouses.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return ok(
    warehouseScope.warehouseId
      ? warehouses.filter((warehouse) => warehouseBelongsToScope(warehouseScope, warehouse))
      : warehouses,
  );
}

/** POST /api/warehouses — tạo kho hoặc trung tâm trung chuyển. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageWarehouses(auth.roleCode)) return fail("Forbidden", 403);

  const parsed = warehouseSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  let parentWarehouseId: string | null = null;
  let regionCode: string | null = parsed.data.region_code?.trim() || null;
  if (parsed.data.warehouse_level === WarehouseLevelCode.COMMUNE) {
    try {
      const parent = await findProvinceParent(parsed.data.province);
      parentWarehouseId = parent?.id ?? null;
      regionCode = parent?.region_code ?? regionCode;
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Không tìm được kho cha", 500);
    }
    if (!parentWarehouseId) {
      return fail("Tỉnh/thành phố chưa có kho cha. Hãy tạo kho tỉnh trước.", 400);
    }
  } else if (parsed.data.warehouse_level === WarehouseLevelCode.PROVINCE) {
    try {
      const parent = await findRegionalParent(parsed.data.province);
      parentWarehouseId = parent?.id ?? null;
      regionCode = parent?.region_code ?? regionCode;
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Không tìm được trung tâm vùng", 500);
    }
    if (!parentWarehouseId) {
      return fail("Tỉnh/thành phố chưa được gắn với trung tâm khai thác vùng", 400);
    }
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("warehouses")
    .insert({
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      ward: parsed.data.warehouse_level === WarehouseLevelCode.COMMUNE ? parsed.data.ward || null : null,
      district: parsed.data.warehouse_level === WarehouseLevelCode.COMMUNE ? parsed.data.district || null : null,
      capacity: parsed.data.capacity ?? null,
      parent_warehouse_id: parentWarehouseId,
      region_code: regionCode,
      ...warehouseGeoColumns(parsed.data),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return fail("Mã kho đã tồn tại", 409);
    return fail(error.message, 500);
  }
  return ok(data, 201);
}
