import type { NextRequest } from "next/server";
import { RoleCode, createAddressSchema } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { addressGeoColumns } from "@/lib/geo";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function seesAllContacts(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN;
}

function canManageContacts(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.CUSTOMER;
}

async function getAccessibleContact(contactId: string, userId: string, roleCode: RoleCode) {
  const supabase = getSupabaseServiceClient();
  const { data: contact, error } = await supabase
    .from("contacts")
    .select("id, user_id, name, phone, default_address_id")
    .eq("id", contactId)
    .maybeSingle();

  if (error) return { supabase, contact: null, response: fail(error.message, 500) };
  if (!contact) return { supabase, contact: null, response: fail("Không tìm thấy liên hệ", 404) };
  if (!seesAllContacts(roleCode) && contact.user_id !== userId) {
    return { supabase, contact: null, response: fail("Forbidden", 403) };
  }
  return { supabase, contact, response: null };
}

/** GET /api/contacts/:id/addresses — danh sách địa chỉ của một liên hệ. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageContacts(auth.roleCode)) return fail("Forbidden", 403);

  const { id } = await params;
  const access = await getAccessibleContact(id, auth.userId, auth.roleCode);
  if (access.response) return access.response;

  const { data: addresses, error } = await access.supabase
    .from("addresses")
    .select("*")
    .eq("contact_id", id)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) return fail(error.message, 500);

  return ok({ contact: access.contact, items: addresses ?? [] });
}

/** POST /api/contacts/:id/addresses — thêm địa chỉ và cập nhật địa chỉ mặc định. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageContacts(auth.roleCode)) return fail("Forbidden", 403);

  const { id } = await params;
  const access = await getAccessibleContact(id, auth.userId, auth.roleCode);
  if (access.response) return access.response;

  const parsed = createAddressSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const { count, error: countError } = await access.supabase
    .from("addresses")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", id);
  if (countError) return fail(countError.message, 500);

  const shouldBeDefault = parsed.data.is_default || !access.contact?.default_address_id || (count ?? 0) === 0;
  const { data: address, error: insertError } = await access.supabase
    .from("addresses")
    .insert({
      contact_id: id,
      recipient_name: parsed.data.recipient_name,
      phone: parsed.data.phone,
      address_line: parsed.data.address_line,
      ward: parsed.data.ward || null,
      district: parsed.data.district || null,
      province: parsed.data.province || null,
      is_default: shouldBeDefault,
      ...addressGeoColumns(parsed.data),
    })
    .select("*")
    .single();
  if (insertError) return fail(insertError.message, 500);

  if (shouldBeDefault) {
    const { error: clearDefaultError } = await access.supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("contact_id", id)
      .neq("id", address.id);
    if (clearDefaultError) return fail(clearDefaultError.message, 500);

    const { error: contactError } = await access.supabase
      .from("contacts")
      .update({ default_address_id: address.id })
      .eq("id", id);
    if (contactError) return fail(contactError.message, 500);
  }

  return ok(address, 201);
}
