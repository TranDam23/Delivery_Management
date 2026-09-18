import { WarehouseLevelCode, WarehouseStatusCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;

/**
 * Đọc toàn bộ kho con đang hoạt động.
 *
 * Supabase/PostgREST giới hạn mặc định 1.000 dòng mỗi request, trong khi số
 * điểm thu gom/phát cấp xã vượt quá con số này. Đọc tuần tự theo trang (sắp
 * theo mã kho để thứ tự ổn định) để không bỏ sót kho của các tỉnh phía sau.
 */
export async function fetchActiveCommuneWarehouses<T>(
  columns: string,
): Promise<{ data: T[]; error: string | null }> {
  const supabase = getSupabaseServiceClient();
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("warehouses")
      .select(columns)
      .eq("warehouse_level", WarehouseLevelCode.COMMUNE)
      .eq("status", WarehouseStatusCode.ACTIVE)
      .order("code")
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { data: [], error: error.message };

    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return { data: rows, error: null };
}
