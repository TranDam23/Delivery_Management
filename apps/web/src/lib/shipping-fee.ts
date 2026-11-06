import type { RouteZone } from "@/lib/tracking-estimate";

export type ShippingServiceType = "standard" | "express" | "same_day";

/** Hệ số quy đổi thể tích mặc định (cm³ / kg): kiện cồng kềnh tính theo thể tích. */
export const VOLUMETRIC_DIVISOR = 6000;
/** Cước tính theo bậc 0,5 kg như bưu chính: bậc đầu nằm trong cước cơ bản. */
export const WEIGHT_STEP_KG = 0.5;

export interface ZoneTariff {
  /** Cước cơ bản cho bậc cân đầu tiên. */
  base: number;
  /** Phụ phí mỗi bậc cân tiếp theo. */
  step: number;
}

export interface AreaSurcharge {
  province: string;
  /** Phường/xã; để trống nghĩa là áp dụng cho cả tỉnh. */
  ward: string | null;
  applyTo: "DELIVERY" | "PICKUP";
  fee: number;
  note: string | null;
}

export interface PricingConfig {
  tariffs: Record<ShippingServiceType, Partial<Record<RouteZone, ZoneTariff>>>;
  weightStepKg: number;
  volumetricDivisor: number;
  /** Cạnh dài nhất (cm) từ mức này trở lên bị tính phụ phí kiện cồng kềnh; 0 = tắt. */
  oversizeSideCm: number;
  oversizeFee: number;
  surcharges: AreaSurcharge[];
}

/**
 * Biểu phí mặc định (khớp dữ liệu khởi tạo trong database). Chỉ dùng làm dự phòng
 * khi chưa đọc được bảng giá; bảng giá thực do Admin chỉnh trong database.
 * Giao trong ngày chỉ áp dụng nội tỉnh.
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  tariffs: {
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
  },
  weightStepKg: WEIGHT_STEP_KG,
  volumetricDivisor: VOLUMETRIC_DIVISOR,
  oversizeSideCm: 100,
  oversizeFee: 30000,
  surcharges: [],
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

export interface FeeAreas {
  pickup?: { province?: string | null; ward?: string | null };
  delivery?: { province?: string | null; ward?: string | null };
}

/** Khối lượng tính cước của một kiện: lớn hơn giữa cân nặng thực và cân nặng quy đổi thể tích. */
export function chargeableWeight(item: Omit<FeeItem, "quantity">, divisor: number = VOLUMETRIC_DIVISOR): number {
  const actual = item.weight ?? 0;
  const volumetric = item.length && item.width && item.height
    ? (item.length * item.width * item.height) / divisor
    : 0;
  return Math.max(actual, volumetric);
}

/** Dịch vụ có được cung cấp trên tuyến này không (giao trong ngày chỉ nội tỉnh). */
export function isServiceAvailable(
  service: ShippingServiceType,
  zone: RouteZone | null,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
): boolean {
  return Boolean(config.tariffs[service]?.[zone ?? "inter_region"]);
}

export interface ShippingFeeBreakdown {
  fee: number;
  zone: RouteZone;
  chargeableKg: number;
  extraSteps: number;
  /** Cước cơ bản của tuyến. */
  baseFee: number;
  /** Phụ phí các bậc cân vượt quá. */
  weightFee: number;
  /** Phụ phí kiện cồng kềnh (0 nếu không áp dụng). */
  oversizeFee: number;
  /** Phụ phí theo khu vực lấy/giao (0 nếu không có). */
  areaSurchargeFee: number;
  areaSurchargeNotes: string[];
  /** Cân nặng tính cước do quy đổi thể tích lớn hơn cân thực. */
  volumetric: boolean;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");
}

/** Phụ phí khu vực đang áp dụng cho một đầu tuyến: ưu tiên cấu hình theo phường/xã, sau đó theo tỉnh. */
function matchSurcharge(
  surcharges: AreaSurcharge[],
  applyTo: AreaSurcharge["applyTo"],
  area: { province?: string | null; ward?: string | null } | undefined,
): AreaSurcharge | null {
  if (!area?.province) return null;
  const province = normalizeText(area.province);
  const ward = normalizeText(area.ward);
  const candidates = surcharges.filter((item) => item.applyTo === applyTo && normalizeText(item.province) === province);
  return candidates.find((item) => item.ward && normalizeText(item.ward) === ward)
    ?? candidates.find((item) => !item.ward)
    ?? null;
}

/**
 * Tính cước = cước cơ bản theo dịch vụ + vùng
 *   + phụ phí mỗi bậc cân vượt quá (cân tính cước = max(cân thực, cân quy đổi thể tích))
 *   + phụ phí kiện cồng kềnh (cạnh dài vượt ngưỡng, tính một lần)
 *   + phụ phí khu vực lấy/giao hàng.
 * Chưa rõ vùng thì tính như liên vùng (thận trọng). Luôn tính lại ở server,
 * không tin total_fee từ trình duyệt. Trả null nếu dịch vụ không áp dụng cho tuyến.
 */
export function calculateShippingFeeBreakdown(
  service: ShippingServiceType,
  items: FeeItem[],
  zone: RouteZone | null,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
  areas?: FeeAreas,
): ShippingFeeBreakdown | null {
  const effectiveZone = zone ?? "inter_region";
  const tariff = config.tariffs[service]?.[effectiveZone];
  if (!tariff) return null;

  const stepKg = config.weightStepKg > 0 ? config.weightStepKg : WEIGHT_STEP_KG;
  const divisor = config.volumetricDivisor > 0 ? config.volumetricDivisor : VOLUMETRIC_DIVISOR;
  let chargeableKg = 0;
  let actualKg = 0;
  for (const item of items) {
    chargeableKg += chargeableWeight(item, divisor) * item.quantity;
    actualKg += (item.weight ?? 0) * item.quantity;
  }
  const extraSteps = Math.max(0, Math.ceil((chargeableKg - stepKg) / stepKg - 1e-9));
  const weightFee = extraSteps * tariff.step;

  const oversize = config.oversizeSideCm > 0
    && items.some((item) => Math.max(item.length ?? 0, item.width ?? 0, item.height ?? 0) >= config.oversizeSideCm);
  const oversizeFee = oversize ? config.oversizeFee : 0;

  const matched = [
    matchSurcharge(config.surcharges, "PICKUP", areas?.pickup),
    matchSurcharge(config.surcharges, "DELIVERY", areas?.delivery),
  ].filter((item): item is AreaSurcharge => item !== null);
  const areaSurchargeFee = matched.reduce((sum, item) => sum + item.fee, 0);

  return {
    fee: Math.round(tariff.base + weightFee + oversizeFee + areaSurchargeFee),
    zone: effectiveZone,
    chargeableKg,
    extraSteps,
    baseFee: tariff.base,
    weightFee,
    oversizeFee,
    areaSurchargeFee,
    areaSurchargeNotes: matched.map((item) => `${item.applyTo === "PICKUP" ? "Lấy hàng" : "Giao hàng"} ${item.ward ? `${item.ward}, ` : ""}${item.province}${item.note ? ` (${item.note})` : ""}`),
    volumetric: chargeableKg > actualKg + 1e-9,
  };
}

export function calculateShippingFee(
  service: ShippingServiceType,
  items: FeeItem[],
  zone: RouteZone | null,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
  areas?: FeeAreas,
): number {
  return calculateShippingFeeBreakdown(service, items, zone, config, areas)?.fee ?? 0;
}
