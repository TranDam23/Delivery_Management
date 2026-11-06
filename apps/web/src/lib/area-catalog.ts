import { getSupabaseServiceClient } from "@/lib/supabase/server";

export interface AreaRef {
  province?: string | null;
  district?: string | null;
  ward?: string | null;
}

type Status = "active" | "inactive";

export interface AreaCatalog {
  provinces: Map<string, Status>;
  districts: Map<string, Status>;
  /** Khóa "tỉnh|quận|xã" (quận để trống khi xã thuộc trực tiếp tỉnh). */
  wards: Map<string, Status>;
  /** Khóa "tỉnh|xã" bất kể quận: có ít nhất một bản ghi đang hoạt động hay không. */
  wardAnyActive: Map<string, boolean>;
}

export interface AreaRow {
  id: string;
  level: "PROVINCE" | "DISTRICT" | "WARD";
  name: string;
  parent_id: string | null;
  status: Status;
}

const CACHE_MS = 60 * 1000;
let cache: { at: number; catalog: AreaCatalog | null; rows: AreaRow[] } | null = null;

export function invalidateAreaCatalogCache(): void {
  cache = null;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");
}

async function loadRows(): Promise<AreaRow[]> {
  const db = getSupabaseServiceClient();
  const pageSize = 1000;
  const rows: AreaRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("administrative_areas")
      .select("id, level, name, parent_id, status")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as AreaRow[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/**
 * Danh mục khu vực đang áp dụng, nhớ tạm 60 giây. Trả về null khi bảng chưa có dữ liệu
 * hoặc không đọc được (chưa chạy migration): khi đó không áp dụng ràng buộc nào.
 */
export async function loadAreaCatalog(): Promise<AreaCatalog | null> {
  return (await loadCache()).catalog;
}

/** Toàn bộ khu vực trong danh mục (đã nhớ tạm cùng với danh mục); rỗng khi chưa có dữ liệu. */
export async function loadAreaRows(): Promise<AreaRow[]> {
  return (await loadCache()).rows;
}

async function loadCache(): Promise<{ catalog: AreaCatalog | null; rows: AreaRow[] }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  let catalog: AreaCatalog | null = null;
  let rows: AreaRow[] = [];
  try {
    rows = await loadRows();
    if (rows.length > 0) {
      const byId = new Map(rows.map((row) => [row.id, row]));
      catalog = { provinces: new Map(), districts: new Map(), wards: new Map(), wardAnyActive: new Map() };
      for (const row of rows) {
        if (row.level === "PROVINCE") {
          catalog.provinces.set(norm(row.name), row.status);
          continue;
        }
        const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
        if (!parent) continue;
        if (row.level === "DISTRICT") {
          catalog.districts.set(`${norm(parent.name)}|${norm(row.name)}`, row.status);
          continue;
        }
        const district = parent.level === "DISTRICT" ? parent : null;
        const province = district ? (district.parent_id ? byId.get(district.parent_id) : undefined) : parent;
        if (!province) continue;
        const provinceKey = norm(province.name);
        catalog.wards.set(`${provinceKey}|${district ? norm(district.name) : ""}|${norm(row.name)}`, row.status);
        const anyKey = `${provinceKey}|${norm(row.name)}`;
        catalog.wardAnyActive.set(anyKey, (catalog.wardAnyActive.get(anyKey) ?? false) || row.status === "active");
      }
    }
  } catch {
    catalog = null;
  }
  cache = { at: Date.now(), catalog, rows };
  return cache;
}

function label(ref: AreaRef): string {
  return [ref.ward, ref.district, ref.province].filter((part) => part && part.trim()).join(", ");
}

/** Khu vực này đang bị tạm dừng trong danh mục không? Khu vực chưa có trong danh mục được coi là cho phép. */
export function isSuspended(catalog: AreaCatalog, ref: AreaRef): boolean {
  const province = norm(ref.province);
  if (!province) return false;
  if (catalog.provinces.get(province) === "inactive") return true;
  const district = norm(ref.district);
  if (district && catalog.districts.get(`${province}|${district}`) === "inactive") return true;
  const ward = norm(ref.ward);
  if (ward) {
    const exact = catalog.wards.get(`${province}|${district}|${ward}`);
    if (exact !== undefined) return exact === "inactive";
    const any = catalog.wardAnyActive.get(`${province}|${ward}`);
    if (any === false) return true;
  }
  return false;
}

/** Từ chối các khu vực đang bị Admin/Điều phối tạm dừng phục vụ. Trả về thông báo lỗi hoặc null. */
export async function suspendedAreaError(refs: Array<AreaRef & { title?: string }>): Promise<string | null> {
  const catalog = await loadAreaCatalog();
  if (!catalog) return null;
  for (const ref of refs) {
    if (isSuspended(catalog, ref)) {
      return `${ref.title ?? "Khu vực"} ${label(ref)} đang tạm dừng phục vụ. Vui lòng chọn khu vực khác hoặc liên hệ điều phối viên.`;
    }
  }
  return null;
}

/** Kho mới phải đặt ở khu vực đã có trong danh mục và đang hoạt động. */
export async function warehouseAreaError(ref: AreaRef, requireWard: boolean): Promise<string | null> {
  const catalog = await loadAreaCatalog();
  if (!catalog) return null;
  const province = norm(ref.province);
  const provinceStatus = catalog.provinces.get(province);
  if (provinceStatus === undefined) return `Tỉnh/thành phố "${ref.province}" chưa có trong danh mục khu vực. Hãy thêm ở mục Khu vực trước.`;
  if (provinceStatus === "inactive") return `Tỉnh/thành phố "${ref.province}" đang tạm dừng trong danh mục khu vực.`;
  if (requireWard) {
    const ward = norm(ref.ward);
    const any = catalog.wardAnyActive.get(`${province}|${ward}`);
    if (any === undefined) return `Xã/phường "${ref.ward}" chưa có trong danh mục khu vực của ${ref.province}. Hãy thêm ở mục Khu vực trước.`;
    if (any === false || isSuspended(catalog, ref)) return `Xã/phường "${ref.ward}" đang tạm dừng trong danh mục khu vực.`;
  }
  return null;
}

/** Danh sách khu vực tạm dừng theo từng cấp, dùng để lọc danh mục chọn địa chỉ. */
export async function suspendedAreaSets(): Promise<{ provinces: Set<string>; districts: Set<string>; wards: Set<string> } | null> {
  const catalog = await loadAreaCatalog();
  if (!catalog) return null;
  const provinces = new Set<string>();
  const districts = new Set<string>();
  const wards = new Set<string>();
  for (const [key, status] of catalog.provinces) if (status === "inactive") provinces.add(key);
  for (const [key, status] of catalog.districts) if (status === "inactive") districts.add(key);
  for (const [key, status] of catalog.wards) if (status === "inactive") wards.add(key);
  return { provinces, districts, wards };
}

export { norm as normalizeAreaKey };
