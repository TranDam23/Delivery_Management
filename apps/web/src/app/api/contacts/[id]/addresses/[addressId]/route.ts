import type { NextRequest } from "next/server";
import { RoleCode, updateAddressSchema } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { addressGeoChanges } from "@/lib/geo";

interface RouteParams {
  params: Promise<{ id: string; addressId: string }>;
}

function seesAllContacts(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN;
}

function canManageContacts(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.CUSTOMER;
}

async function getAccessibleAddress(contactId: string, addressId: string, userId: string, roleCode: RoleCode) {
  const supabase = getSupabaseServiceClient();
  const { data: address, error } = await supabase
    .from("addresses")
    .select("*")
    .eq("id", addressId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (error) return { supabase, address: null, response: fail(error.message, 500) };
  if (!address) return { supabase, address: null, response: fail("Không tìm thấy địa chỉ", 404) };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, user_id, default_address_id")
    .eq("id", contactId)
    .maybeSingle();
  if (contactError) return { supabase, address: null, response: fail(contactError.message, 500) };
  if (!contact) return { supabase, address: null, response: fail("Không tìm thấy liên hệ", 404) };
  if (!seesAllContacts(roleCode) && contact.user_id !== userId) {
    return { supabase, address: null, response: fail("Forbidden", 403) };
  }

  return { supabase, address, contact, response: null };
}

/** PATCH /api/contacts/:id/addresses/:addressId — sửa địa chỉ. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageContacts(auth.roleCode)) return fail("Forbidden", 403);

  const { id, addressId } = await params;
  const access = await getAccessibleAddress(id, addressId, auth.userId, auth.roleCode);
  if (access.response) return access.response;

  const parsed = updateAddressSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return fail("Không có dữ liệu cần cập nhật");

  const changes: {
    recipient_name?: string;
    phone?: string;
    address_line?: string;
    ward?: string | null;
    district?: string | null;
    province?: string | null;
    is_default?: boolean;
  } = {};
  if (parsed.data.recipient_name !== undefined) changes.recipient_name = parsed.data.recipient_name;
  if (parsed.data.phone !== undefined) changes.phone = parsed.data.phone;
  if (parsed.data.address_line !== undefined) changes.address_line = parsed.data.address_line;
  if (parsed.data.ward !== undefined) changes.ward = parsed.data.ward || null;
  if (parsed.data.district !== undefined) changes.district = parsed.data.district || null;
  if (parsed.data.province !== undefined) changes.province = parsed.data.province || null;

  const makeDefault = parsed.data.is_default === true;
  changes.is_default = makeDefault || access.address?.is_default === true;
  const { data: updated, error } = await access.supabase
    .from("addresses")
    .update({ ...changes, ...addressGeoChanges(parsed.data) })
    .eq("id", addressId)
    .select("*")
    .single();
  if (error) return fail(error.message, 500);

  if (makeDefault) {
    const { error: clearError } = await access.supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("contact_id", id)
      .neq("id", addressId);
    if (clearError) return fail(clearError.message, 500);
    const { error: contactError } = await access.supabase
      .from("contacts")
      .update({ default_address_id: addressId })
      .eq("id", id);
    if (contactError) return fail(contactError.message, 500);
  }

  return ok(updated);
}

/** DELETE /api/contacts/:id/addresses/:addressId — xóa địa chỉ chưa tham gia đơn. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageContacts(auth.roleCode)) return fail("Forbidden", 403);

  const { id, addressId } = await params;
  const access = await getAccessibleAddress(id, addressId, auth.userId, auth.roleCode);
  if (access.response) return access.response;

  const { count, error: orderError } = await access.supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .or(`pickup_address_id.eq.${addressId},delivery_address_id.eq.${addressId}`);
  if (orderError) return fail(orderError.message, 500);
  if ((count ?? 0) > 0) {
    return fail("Không thể xóa địa chỉ đã được dùng trong đơn hàng để bảo toàn lịch sử giao nhận", 409);
  }

  const { error } = await access.supabase.from("addresses").delete().eq("id", addressId);
  if (error) return fail(error.message, 500);

  if (access.address?.is_default) {
    const { data: nextAddress, error: nextError } = await access.supabase
      .from("addresses")
      .select("id")
      .eq("contact_id", id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextError) return fail(nextError.message, 500);

    if (nextAddress) {
      const { error: updateAddressError } = await access.supabase
        .from("addresses")
        .update({ is_default: true })
        .eq("id", nextAddress.id);
      if (updateAddressError) return fail(updateAddressError.message, 500);
    }
    const { error: contactError } = await access.supabase
      .from("contacts")
      .update({ default_address_id: nextAddress?.id ?? null })
      .eq("id", id);
    if (contactError) return fail(contactError.message, 500);
  }

  return ok({ id: addressId });
}
