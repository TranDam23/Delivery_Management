import type { NextRequest } from "next/server";
import { z } from "zod";
import { ContactType, RoleCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { suspendedAreaError } from "@/lib/area-catalog";
import { addressGeoColumns } from "@/lib/geo";
import { normalizeArea } from "@/lib/shipment-routing";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const quickSchema = z.object({
  role: z.enum([ContactType.SENDER, ContactType.RECEIVER]),
  name: z.string().trim().min(2, "Họ tên phải có ít nhất 2 ký tự").max(120),
  phone: z.string().trim().regex(/^0\d{9}$/, "Số điện thoại phải có 10 chữ số và bắt đầu bằng 0"),
  email: z.string().trim().email().max(254).optional().or(z.literal("").transform(() => undefined)),
  address_line: z.string().trim().min(1, "Địa chỉ cụ thể không được để trống").max(255),
  ward: z.string().trim().min(1, "Phường/Xã không được để trống").max(120),
  district: z.string().trim().max(120).optional().default(""),
  province: z.string().trim().min(1, "Tỉnh/Thành phố không được để trống").max(120),
});

/**
 * POST /api/contacts/quick — tìm hoặc tạo người gửi/nhận (theo số điện thoại) cùng một địa chỉ
 * trong sổ địa chỉ của chính điều phối viên, rồi trả về id để dùng khi tạo đơn hộ khách.
 * Gọi lại với cùng số điện thoại và địa chỉ thì dùng lại bản ghi cũ, không tạo trùng.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.DISPATCHER && auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);

  const parsed = quickSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Thông tin không hợp lệ", 400);
  const input = parsed.data;
  const suspendedError = await suspendedAreaError([{ title: "Khu vực", province: input.province, district: input.district, ward: input.ward }]);
  if (suspendedError) return fail(suspendedError, 400);
  const supabase = getSupabaseServiceClient();

  const { data: existing, error: findError } = await supabase
    .from("contacts")
    .select("id, type, default_address_id")
    .eq("user_id", auth.userId)
    .eq("phone", input.phone)
    .maybeSingle();
  if (findError) return fail(findError.message, 500);

  let contactId: string;
  let defaultAddressId: string | null = null;
  if (existing) {
    contactId = existing.id;
    defaultAddressId = existing.default_address_id;
    // Người này đã từng là bên còn lại: nâng vai trò lên "both" để dùng được cho cả hai phía.
    if (existing.type !== input.role && existing.type !== ContactType.BOTH) {
      const { error } = await supabase.from("contacts").update({ type: ContactType.BOTH }).eq("id", existing.id);
      if (error) return fail(error.message, 500);
    }
  } else {
    const { data: created, error } = await supabase
      .from("contacts")
      .insert({ user_id: auth.userId, type: input.role, name: input.name, phone: input.phone, email: input.email ?? null })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return fail("Số điện thoại này vừa được tạo, vui lòng thử lại", 409);
      return fail(error.message, 500);
    }
    contactId = created.id;
  }

  const { data: addresses, error: addressesError } = await supabase
    .from("addresses")
    .select("id, address_line, ward, province")
    .eq("contact_id", contactId);
  if (addressesError) return fail(addressesError.message, 500);
  const sameAddress = (addresses ?? []).find((address) =>
    normalizeArea(address.address_line) === normalizeArea(input.address_line)
    && normalizeArea(address.ward) === normalizeArea(input.ward)
    && normalizeArea(address.province) === normalizeArea(input.province));
  if (sameAddress) return ok({ contact_id: contactId, address_id: sameAddress.id });

  const isFirst = !defaultAddressId || (addresses ?? []).length === 0;
  const { data: address, error: insertError } = await supabase
    .from("addresses")
    .insert({
      contact_id: contactId,
      recipient_name: input.name,
      phone: input.phone,
      address_line: input.address_line,
      ward: input.ward,
      district: input.district || null,
      province: input.province,
      is_default: isFirst,
      ...addressGeoColumns({}),
    })
    .select("id")
    .single();
  if (insertError) return fail(insertError.message, 500);
  if (isFirst) {
    const { error } = await supabase.from("contacts").update({ default_address_id: address.id }).eq("id", contactId);
    if (error) return fail(error.message, 500);
  }
  return ok({ contact_id: contactId, address_id: address.id });
}
