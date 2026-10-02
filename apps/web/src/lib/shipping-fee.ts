import type { RouteZone } from "@/lib/tracking-estimate";

export type ShippingServiceType = "standard" | "express" | "same_day";

/** Hệ số quy đổi thể tích (cm³ / kg) thường dùng cho chuyển phát: kiện cồng kềnh tính theo thể tích. */
export const VOLUMETRIC_DIVISOR = 6000;
/** Cước tính theo bậc 0,5 kg như bưu chính: bậc đầu nằm trong cước cơ bản. */
export const WEIGHT_STEP_KG = 0.5;

interface ZoneTariff {
  /** Cước cơ bản cho bậc cân đầu tiên (đến 0,5 kg). */
  base: number;
  /** Phụ phí mỗi bậc 0,5 kg tiếp theo. */
  step: number;
}

/**
 * Biểu phí demo theo dịch vụ và phạm vi tuyến (nội tỉnh / nội vùng / liên vùng),
 * cùng cấu trúc bảng giá bưu chính. Giao trong ngày chỉ áp dụng nội tỉnh.
 * Số tiền chỉ là mặc định để chạy thử; chỉnh tại đây khi có bảng giá thật.
 */
export const SHIPPING_TARIFF: Record<ShippingServiceType, Partial<Record<RouteZone, ZoneTariff>>> = {
  standard: {
    same_province: { base: 20000, step: 2500 },
    same_region: { base: 28000, step: 4000 },
    inter_region: { base: 38000, step: 5500 },
  },
  express: {
    same_province: { base: 35000, step: 4000 },
    same_region: { base: 45000, step: 6000 },
    inter_region: { base: 60000, step: 8500 },
  },
  same_day: {
    same_province: { base: 55000, step: 5000 },
  },
};

export const ZONE_LABEL: Record<RouteZone, string> = {
  same_province: "Nội tỉnh",
  same_region: "Nội vùng",
  inter_region: "Liên vùng",
};

export interface FeeItem {
  weight?: number;
  /** Kích thước kiện, đơn vị cm. */
  length?: number;
  width?: number;
  height?: number;
  quantity: number;
}

/** Khối lượng tính cước của một kiện: lớn hơn giữa cân nặng thực và cân nặng quy đổi thể tích. */
export function chargeableWeight(item: Omit<FeeItem, "quantity">): number {
  const actual = item.weight ?? 0;
  const volumetric = item.length && item.width && item.height
    ? (item.length * item.width * item.height) / VOLUMETRIC_DIVISOR
    : 0;
  return Math.max(actual, volumetric);
}

/** Dịch vụ có được cung cấp trên tuyến này không (giao trong ngày chỉ nội tỉnh). */
export function isServiceAvailable(service: ShippingServiceType, zone: RouteZone | null): boolean {
  return Boolean(SHIPPING_TARIFF[service][zone ?? "inter_region"]);
}

export interface ShippingFeeBreakdown {
  fee: number;
  zone: RouteZone;
  chargeableKg: number;
  extraSteps: number;
}

/**
 * Tính cước: cước cơ bản theo dịch vụ + vùng, cộng phụ phí mỗi bậc 0,5 kg vượt quá.
 * Chưa rõ vùng thì tính như liên vùng (thận trọng). Luôn tính lại ở server,
 * không tin total_fee từ trình duyệt. Trả null nếu dịch vụ không áp dụng cho tuyến.
 */
export function calculateShippingFeeBreakdown(service: ShippingServiceType, items: FeeItem[], zone: RouteZone | null): ShippingFeeBreakdown | null {
  const effectiveZone = zone ?? "inter_region";
  const tariff = SHIPPING_TARIFF[service][effectiveZone];
  if (!tariff) return null;
  const chargeableKg = items.reduce((sum, item) => sum + chargeableWeight(item) * item.quantity, 0);
  const extraSteps = Math.max(0, Math.ceil((chargeableKg - WEIGHT_STEP_KG) / WEIGHT_STEP_KG - 1e-9));
  return { fee: Math.round(tariff.base + extraSteps * tariff.step), zone: effectiveZone, chargeableKg, extraSteps };
}

export function calculateShippingFee(service: ShippingServiceType, items: FeeItem[], zone: RouteZone | null): number {
  return calculateShippingFeeBreakdown(service, items, zone)?.fee ?? 0;
}
