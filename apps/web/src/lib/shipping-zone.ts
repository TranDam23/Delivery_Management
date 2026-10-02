import { WarehouseLevelCode, WarehouseStatusCode } from "@delivery/shared";
import { normalizeArea } from "@/lib/shipment-routing";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { RouteZone } from "@/lib/tracking-estimate";

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; regions: Map<string, string> } | null = null;

/** Vùng của từng tỉnh, lấy từ kho cấp tỉnh (chỉ vài chục dòng nên được nhớ tạm). */
async function provinceRegions(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.regions;
  const { data, error } = await getSupabaseServiceClient()
    .from("warehouses")
    .select("province, region_code")
    .eq("warehouse_level", WarehouseLevelCode.PROVINCE)
    .eq("status", WarehouseStatusCode.ACTIVE)
    .not("region_code", "is", null);
  if (error) throw new Error(error.message);
  const regions = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.province && row.region_code) regions.set(normalizeArea(row.province), row.region_code);
  }
  cache = { at: Date.now(), regions };
  return regions;
}

/** Phạm vi tuyến giữa hai tỉnh: nội tỉnh, nội vùng hay liên vùng (chưa rõ vùng → liên vùng). */
export async function zoneForProvinces(pickupProvince: string | null | undefined, deliveryProvince: string | null | undefined): Promise<RouteZone> {
  const pickup = normalizeArea(pickupProvince);
  const delivery = normalizeArea(deliveryProvince);
  if (pickup && pickup === delivery) return "same_province";
  const regions = await provinceRegions();
  const pickupRegion = regions.get(pickup);
  return pickupRegion && pickupRegion === regions.get(delivery) ? "same_region" : "inter_region";
}
