import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api-response";
import { calculateShippingFeeBreakdown, isServiceAvailable } from "@/lib/shipping-fee";
import { zoneForProvinces } from "@/lib/shipping-zone";

const quoteSchema = z.object({
  service_type: z.enum(["standard", "express", "same_day"]),
  pickup_province: z.string().trim().max(120).optional(),
  delivery_province: z.string().trim().max(120).optional(),
  items: z.array(z.object({
    quantity: z.number().int().positive().max(10000).default(1),
    weight: z.number().finite().positive().max(10000).optional(),
    length: z.number().finite().positive().max(1000).optional(),
    width: z.number().finite().positive().max(1000).optional(),
    height: z.number().finite().positive().max(1000).optional(),
  })).min(1).max(20),
});

/** POST /api/shipping-quote — báo giá tham khảo theo tuyến; công khai vì khách vãng lai cũng cần. */
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
  const available = isServiceAvailable(input.service_type, zone);
  const breakdown = calculateShippingFeeBreakdown(input.service_type, input.items, zone);
  return ok({
    zone,
    available,
    fee: breakdown?.fee ?? null,
    chargeableKg: breakdown?.chargeableKg ?? null,
    message: available ? null : "Dịch vụ giao trong ngày chỉ áp dụng nội tỉnh. Hãy chọn dịch vụ khác.",
  });
}
