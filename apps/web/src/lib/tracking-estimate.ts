import { normalizeArea } from "@/lib/shipment-routing";

/** Phạm vi tuyến như cách bưu chính phân vùng: nội tỉnh, nội vùng, liên vùng. */
export type RouteZone = "same_province" | "same_region" | "inter_region";

export interface ZoneWarehouse {
  province: string | null;
  region_code: string | null;
}

export function routeZone(pickup: ZoneWarehouse | null | undefined, delivery: ZoneWarehouse | null | undefined): RouteZone | null {
  if (!pickup || !delivery) return null;
  if (normalizeArea(pickup.province) && normalizeArea(pickup.province) === normalizeArea(delivery.province)) return "same_province";
  if (pickup.region_code && pickup.region_code === delivery.region_code) return "same_region";
  return "inter_region";
}

/**
 * Thời gian phát hứa hẹn tham khảo (giờ) theo dịch vụ và phạm vi tuyến, theo thang
 * thường dùng của bưu chính: nội tỉnh 1–2 ngày, liên vùng 3–5 ngày với dịch vụ thường.
 */
const SERVICE_HOURS = {
  standard: { same_province: 48, same_region: 72, inter_region: 120 },
  express: { same_province: 24, same_region: 36, inter_region: 60 },
} as const;
const FALLBACK_HOURS = { standard: 72, express: 24 } as const;

/** Mốc giao dự kiến: ưu tiên ngày hẹn của đơn, sau đó suy từ dịch vụ + tuyến. */
export function estimateDeliveryDate(
  createdAt: string,
  serviceType: string,
  scheduledAt: string | null,
  zone: RouteZone | null = null,
): { date: string | null; source: "scheduled" | "service" } {
  if (scheduledAt && !Number.isNaN(Date.parse(scheduledAt))) return { date: scheduledAt, source: "scheduled" };
  const createdTime = Date.parse(createdAt);
  if (Number.isNaN(createdTime)) return { date: null, source: "service" };
  if (serviceType === "same_day") {
    const dayMs = 24 * 60 * 60 * 1000;
    const vietNamOffsetMs = 7 * 60 * 60 * 1000;
    const endOfLocalDay = (Math.floor((createdTime + vietNamOffsetMs) / dayMs) + 1) * dayMs - vietNamOffsetMs - 60_000;
    return { date: new Date(Math.max(createdTime, endOfLocalDay)).toISOString(), source: "service" };
  }
  if (serviceType !== "standard" && serviceType !== "express") return { date: null, source: "service" };
  const hours = zone ? SERVICE_HOURS[serviceType][zone] : FALLBACK_HOURS[serviceType];
  return { date: new Date(createdTime + hours * 60 * 60 * 1000).toISOString(), source: "service" };
}
