import type { NextRequest } from "next/server";
import { VIETNAM_PROVINCES } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface LocationRow {
  province: string | null;
  district: string | null;
  ward: string | null;
}

interface LocationCatalog {
  provinces: string[];
  districts: Record<string, string[]>;
  wards: Record<string, Record<string, string[]>>;
  wardsByProvince: Record<string, string[]>;
}

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

function sortVietnamese(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "vi"));
}

/**
 * GET /api/locations — danh mục tỉnh/quận/xã dùng chung cho các form địa chỉ.
 *
 * Danh mục khu vực được tổng hợp từ dữ liệu kho và địa chỉ đã có trong
 * database. Vì vậy giá trị người dùng chọn luôn có thể đối chiếu với mạng kho
 * và không tạo ra tên khu vực tự do làm sai phân kho.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const supabase = getSupabaseServiceClient();
  const warehouseRows: LocationRow[] = [];
  const addressRows: LocationRow[] = [];
  const pageSize = 1000;

  // Đọc đủ dữ liệu vì Supabase có thể giới hạn mỗi request ở 1.000 dòng.
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from("warehouses")
      .select("province, district, ward")
      .eq("status", "active")
      .range(from, from + pageSize - 1);
    if (result.error) return fail(result.error.message, 500);
    warehouseRows.push(...((result.data ?? []) as LocationRow[]));
    if (!result.data || result.data.length < pageSize) break;
  }

  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from("addresses")
      .select("province, district, ward")
      .range(from, from + pageSize - 1);
    if (result.error) return fail(result.error.message, 500);
    addressRows.push(...((result.data ?? []) as LocationRow[]));
    if (!result.data || result.data.length < pageSize) break;
  }

  const provinces = new Set<string>(VIETNAM_PROVINCES);
  const districts = new Map<string, Set<string>>();
  const wards = new Map<string, Map<string, Set<string>>>();
  const wardsByProvince = new Map<string, Set<string>>();

  function addLocation(row: LocationRow): void {
    const province = clean(row.province);
    const district = clean(row.district);
    const ward = clean(row.ward);
    if (!province) return;

    provinces.add(province);

    if (district) {
      const provinceDistricts = districts.get(province) ?? new Set<string>();
      provinceDistricts.add(district);
      districts.set(province, provinceDistricts);
    }

    if (ward) {
      const provinceWards = wardsByProvince.get(province) ?? new Set<string>();
      provinceWards.add(ward);
      wardsByProvince.set(province, provinceWards);

      if (district) {
        const provinceWardMap = wards.get(province) ?? new Map<string, Set<string>>();
        const districtWards = provinceWardMap.get(district) ?? new Set<string>();
        districtWards.add(ward);
        provinceWardMap.set(district, districtWards);
        wards.set(province, provinceWardMap);
      }
    }
  }

  for (const row of warehouseRows) addLocation(row);
  for (const row of addressRows) addLocation(row);

  const districtRecord: Record<string, string[]> = {};
  for (const [province, values] of districts) districtRecord[province] = sortVietnamese(values);

  const wardRecord: Record<string, Record<string, string[]>> = {};
  for (const [province, districtMap] of wards) {
    wardRecord[province] = {};
    for (const [district, values] of districtMap) wardRecord[province][district] = sortVietnamese(values);
  }

  const wardsByProvinceRecord: Record<string, string[]> = {};
  for (const [province, values] of wardsByProvince) wardsByProvinceRecord[province] = sortVietnamese(values);

  const catalog: LocationCatalog = {
    provinces: sortVietnamese(provinces),
    districts: districtRecord,
    wards: wardRecord,
    wardsByProvince: wardsByProvinceRecord,
  };

  return ok(catalog);
}
