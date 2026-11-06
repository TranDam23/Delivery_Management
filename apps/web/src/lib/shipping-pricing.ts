import {
  DEFAULT_PRICING_CONFIG,
  type AreaSurcharge,
  type PricingConfig,
  type ShippingServiceType,
  type ZoneTariff,
} from "@/lib/shipping-fee";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { RouteZone } from "@/lib/tracking-estimate";

const CACHE_MS = 30 * 1000;
let cache: { at: number; config: PricingConfig } | null = null;

export const SETTING_KEYS = {
  weightStepKg: "SHIPPING_WEIGHT_STEP_KG",
  volumetricDivisor: "SHIPPING_VOLUMETRIC_DIVISOR",
  oversizeSideCm: "SHIPPING_OVERSIZE_SIDE_CM",
  oversizeFee: "SHIPPING_OVERSIZE_FEE",
} as const;

export function pricingDb(): ReturnType<typeof getSupabaseServiceClient> {
  return getSupabaseServiceClient();
}

export function invalidatePricingCache(): void {
  cache = null;
}

interface TariffRow { service_type: ShippingServiceType; zone: RouteZone; base_fee: number | string; step_fee: number | string; status: string }
interface SurchargeRow { province: string; ward: string | null; apply_to: "DELIVERY" | "PICKUP"; surcharge_fee: number | string; note: string | null; status: string }

function positive(value: string | null | undefined, fallback: number, allowZero = false): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed > 0 || (allowZero && parsed === 0) ? parsed : fallback;
}

/**
 * Bảng giá đang áp dụng, đọc từ database và nhớ tạm 30 giây. Nếu chưa chạy
 * migration hoặc đọc lỗi thì dùng biểu phí mặc định để việc tạo đơn không bị chặn.
 */
export async function loadPricingConfig(): Promise<PricingConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.config;
  try {
    const db = pricingDb();
    const [tariffs, surcharges, settings] = await Promise.all([
      db.from("shipping_tariffs").select("service_type, zone, base_fee, step_fee, status"),
      db.from("shipping_area_surcharges").select("province, ward, apply_to, surcharge_fee, note, status"),
      db.from("system_settings").select("key, value").in("key", Object.values(SETTING_KEYS)),
    ]);
    if (tariffs.error || surcharges.error || settings.error || !tariffs.data || tariffs.data.length === 0) {
      return DEFAULT_PRICING_CONFIG;
    }

    const table: PricingConfig["tariffs"] = { standard: {}, express: {}, same_day: {} };
    for (const row of tariffs.data as TariffRow[]) {
      if (row.status !== "active") continue;
      const entry: ZoneTariff = { base: Number(row.base_fee), step: Number(row.step_fee) };
      table[row.service_type][row.zone] = entry;
    }
    const values = new Map((settings.data ?? []).map((row: { key: string; value: string | null }) => [row.key, row.value]));
    const config: PricingConfig = {
      tariffs: table,
      weightStepKg: positive(values.get(SETTING_KEYS.weightStepKg), DEFAULT_PRICING_CONFIG.weightStepKg),
      volumetricDivisor: positive(values.get(SETTING_KEYS.volumetricDivisor), DEFAULT_PRICING_CONFIG.volumetricDivisor),
      oversizeSideCm: positive(values.get(SETTING_KEYS.oversizeSideCm), DEFAULT_PRICING_CONFIG.oversizeSideCm, true),
      oversizeFee: positive(values.get(SETTING_KEYS.oversizeFee), DEFAULT_PRICING_CONFIG.oversizeFee, true),
      surcharges: (surcharges.data as SurchargeRow[])
        .filter((row) => row.status === "active")
        .map((row): AreaSurcharge => ({ province: row.province, ward: row.ward, applyTo: row.apply_to, fee: Number(row.surcharge_fee), note: row.note })),
    };
    cache = { at: Date.now(), config };
    return config;
  } catch {
    return DEFAULT_PRICING_CONFIG;
  }
}
