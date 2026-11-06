import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { invalidatePricingCache, pricingDb, SETTING_KEYS } from "@/lib/shipping-pricing";

const money = z.number().int().nonnegative().max(100_000_000);

const putSchema = z.object({
  tariffs: z.array(z.object({
    service_type: z.enum(["standard", "express", "same_day"]),
    zone: z.enum(["same_province", "same_region", "inter_region"]),
    base_fee: money,
    step_fee: money,
    status: z.enum(["active", "inactive"]),
  })).min(1).max(20),
  settings: z.object({
    weightStepKg: z.number().positive().max(100),
    volumetricDivisor: z.number().int().min(1000).max(100000),
    oversizeSideCm: z.number().nonnegative().max(1000),
    oversizeFee: money,
  }),
});

const surchargeSchema = z.object({
  province: z.string().trim().min(2).max(120),
  ward: z.string().trim().max(120).nullable().optional(),
  apply_to: z.enum(["DELIVERY", "PICKUP"]),
  surcharge_fee: money,
  note: z.string().trim().max(200).nullable().optional(),
});

function isAdmin(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN;
}

/** GET /api/shipping-pricing — bảng giá hiện hành (Admin). */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!isAdmin(auth.roleCode)) return fail("Forbidden", 403);

  const db = pricingDb();
  const [tariffs, surcharges, settings] = await Promise.all([
    db.from("shipping_tariffs").select("*").order("service_type").order("zone"),
    db.from("shipping_area_surcharges").select("*").order("province").order("ward", { nullsFirst: true }),
    db.from("system_settings").select("key, value").in("key", Object.values(SETTING_KEYS)),
  ]);
  if (tariffs.error) return fail(tariffs.error.message, 500);
  if (surcharges.error) return fail(surcharges.error.message, 500);
  if (settings.error) return fail(settings.error.message, 500);
  const values = Object.fromEntries((settings.data ?? []).map((row: { key: string; value: string | null }) => [row.key, row.value]));
  return ok({
    tariffs: tariffs.data ?? [],
    surcharges: surcharges.data ?? [],
    settings: {
      weightStepKg: Number(values[SETTING_KEYS.weightStepKg] ?? 0.5),
      volumetricDivisor: Number(values[SETTING_KEYS.volumetricDivisor] ?? 6000),
      oversizeSideCm: Number(values[SETTING_KEYS.oversizeSideCm] ?? 100),
      oversizeFee: Number(values[SETTING_KEYS.oversizeFee] ?? 30000),
    },
  });
}

/** PUT /api/shipping-pricing — lưu bảng cước theo tuyến và cấu hình cân nặng/kích thước (Admin). */
export async function PUT(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!isAdmin(auth.roleCode)) return fail("Forbidden", 403);

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Bảng giá không hợp lệ: các số tiền phải là số nguyên không âm", 400);
  const { tariffs, settings } = parsed.data;
  const db = pricingDb();

  const { error: tariffError } = await db.from("shipping_tariffs").upsert(tariffs, { onConflict: "service_type,zone" });
  if (tariffError) return fail(tariffError.message, 500);

  const rows = [
    { key: SETTING_KEYS.weightStepKg, value: String(settings.weightStepKg), description: "Bước cân nặng tính cước (kg)" },
    { key: SETTING_KEYS.volumetricDivisor, value: String(settings.volumetricDivisor), description: "Hệ số quy đổi thể tích (cm³/kg)" },
    { key: SETTING_KEYS.oversizeSideCm, value: String(settings.oversizeSideCm), description: "Cạnh dài nhất (cm) bị tính phụ phí cồng kềnh" },
    { key: SETTING_KEYS.oversizeFee, value: String(settings.oversizeFee), description: "Phụ phí kiện cồng kềnh (đồng)" },
  ];
  const { error: settingError } = await db.from("system_settings").upsert(rows, { onConflict: "key" });
  if (settingError) return fail(settingError.message, 500);

  invalidatePricingCache();
  await writeAuditLog({ userId: auth.userId, action: "SHIPPING_PRICING_UPDATE", entityType: "shipping_pricing", entityId: "tariffs", newData: parsed.data, request });
  return ok({ saved: true });
}

/** POST /api/shipping-pricing — thêm phụ phí theo khu vực (Admin). */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!isAdmin(auth.roleCode)) return fail("Forbidden", 403);

  const parsed = surchargeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Phụ phí khu vực không hợp lệ", 400);
  const { data, error } = await pricingDb().from("shipping_area_surcharges").insert({
    province: parsed.data.province,
    ward: parsed.data.ward?.trim() || null,
    apply_to: parsed.data.apply_to,
    surcharge_fee: parsed.data.surcharge_fee,
    note: parsed.data.note?.trim() || null,
  }).select("*").single();
  if (error) {
    if (error.code === "23505") return fail("Khu vực này đã có phụ phí cho cùng chiều lấy/giao", 409);
    return fail(error.message, 500);
  }
  invalidatePricingCache();
  await writeAuditLog({ userId: auth.userId, action: "SHIPPING_SURCHARGE_CREATE", entityType: "shipping_area_surcharge", entityId: data.id, newData: data, request });
  return ok(data, 201);
}
