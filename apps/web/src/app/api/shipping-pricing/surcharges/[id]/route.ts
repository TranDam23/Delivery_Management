import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { invalidatePricingCache, pricingDb } from "@/lib/shipping-pricing";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  surcharge_fee: z.number().int().nonnegative().max(100_000_000).optional(),
  note: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Không có thay đổi nào");

/** PATCH /api/shipping-pricing/surcharges/:id — sửa mức phụ phí hoặc tạm dừng (Admin). */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Dữ liệu cập nhật không hợp lệ", 400);

  const { data, error } = await pricingDb().from("shipping_area_surcharges").update(parsed.data).eq("id", id).select("*").maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("Không tìm thấy phụ phí", 404);
  invalidatePricingCache();
  await writeAuditLog({ userId: auth.userId, action: "SHIPPING_SURCHARGE_UPDATE", entityType: "shipping_area_surcharge", entityId: id, newData: data, request });
  return ok(data);
}

/** DELETE /api/shipping-pricing/surcharges/:id — xóa phụ phí khu vực (Admin). */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);

  const { id } = await params;
  const { data, error } = await pricingDb().from("shipping_area_surcharges").delete().eq("id", id).select("*").maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("Không tìm thấy phụ phí", 404);
  invalidatePricingCache();
  await writeAuditLog({ userId: auth.userId, action: "SHIPPING_SURCHARGE_DELETE", entityType: "shipping_area_surcharge", entityId: id, oldData: data, request });
  return ok({ id });
}
