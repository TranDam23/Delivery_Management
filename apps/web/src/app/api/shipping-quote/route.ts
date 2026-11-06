import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api-response";
import { calculateShippingFeeBreakdown, isServiceAvailable } from "@/lib/shipping-fee";
import { loadPricingConfig } from "@/lib/shipping-pricing";
import { zoneForProvinces } from "@/lib/shipping-zone";

const quoteSchema = z.object({
  service_type: z.enum(["standard", "express", "same_day"]),
  pickup_province: z.string().trim().max(120).optional(),
  pickup_ward: z.string().trim().max(120).optional(),
  delivery_province: z.string().trim().max(120).optional(),
  delivery_ward: z.string().trim().max(120).optional(),
  items: z.array(z.object({
    quantity: z.number().int().positive().max(10000).default(1),
    weight: z.number().finite().positive().max(10000).optional(),
    length: z.number().finite().positive().max(1000).optional(),
    width: z.number().finite().positive().max(1000).optional(),
    height: z.number().finite().positive().max(1000).optional(),
  })).min(1).max(20),
});

/** POST /api/shipping-quote — báo giá theo bảng giá đang áp dụng; công khai vì khách vãng lai cũng cần. */
export async function POST(request: NextRequest) {
  const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Thông tin báo giá không hợp lệ", 400);
  const input = parsed.data;
  let zone;
  try {
    zone = await zoneForProvinces(input.pickup_province, input.delivery_province);
  } catch {
    return fail("Chưa tính được phạm vi tuyến lúc này", 503);
  }
  const pricing = await loadPricingConfig();
  const available = isServiceAvailable(input.service_type, zone, pricing);
  const breakdown = calculateShippingFeeBreakdown(input.service_type, input.items, zone, pricing, {
    pickup: { province: input.pickup_province, ward: input.pickup_ward },
    delivery: { province: input.delivery_province, ward: input.delivery_ward },
  });
  return ok({
    zone,
    available,
    fee: breakdown?.fee ?? null,
    chargeableKg: breakdown?.chargeableKg ?? null,
    breakdown: breakdown && {
      baseFee: breakdown.baseFee,
      weightFee: breakdown.weightFee,
      extraSteps: breakdown.extraSteps,
      oversizeFee: breakdown.oversizeFee,
      areaSurchargeFee: breakdown.areaSurchargeFee,
      areaSurchargeNotes: breakdown.areaSurchargeNotes,
      volumetric: breakdown.volumetric,
    },
    message: available ? null : "Dịch vụ này không áp dụng cho tuyến đã chọn (giao trong ngày chỉ áp dụng nội tỉnh). Hãy chọn dịch vụ khác.",
  });
}
