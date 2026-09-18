import type { NextRequest } from "next/server";
import {
  RoleCode,
  updateContactSchema,
  type ContactWithDefaultAddress,
} from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const CONTACT_SELECT =
  "id, user_id, type, name, phone, email, default_address_id, created_at, updated_at, " +
  "default_address:addresses!contacts_default_address_id_fkey(" +
  "id, contact_id, recipient_name, phone, address_line, ward, district, province, " +
  "latitude, longitude, place_id, formatted_address, location_source, is_default, created_at, updated_at)";

function seesAllContacts(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN;
}

function canManageContacts(roleCode: RoleCode): boolean {
  return seesAllContacts(roleCode) || roleCode === RoleCode.CUSTOMER;
}

async function getAccessibleContact(contactId: string, userId: string, roleCode: RoleCode) {
  const supabase = getSupabaseServiceClient();
  const { data: contactData, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("id", contactId)
    .maybeSingle();

  if (error) return { supabase, contact: null, response: fail(error.message, 500) };
  const contact = contactData as ContactWithDefaultAddress | null;
  if (!contact) return { supabase, contact: null, response: fail("Không tìm thấy liên hệ", 404) };
  if (!seesAllContacts(roleCode) && contact.user_id !== userId) {
    return { supabase, contact: null, response: fail("Forbidden", 403) };
  }
  return { supabase, contact, response: null };
}

/** GET /api/contacts/:id — lấy thông tin một contact để sửa. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageContacts(auth.roleCode)) return fail("Forbidden", 403);

  const { id } = await params;
  const access = await getAccessibleContact(id, auth.userId, auth.roleCode);
  if (access.response) return access.response;
  return ok(access.contact);
}

/** PATCH /api/contacts/:id — sửa contact trong sổ địa chỉ. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageContacts(auth.roleCode)) return fail("Forbidden", 403);

  const { id } = await params;
  const access = await getAccessibleContact(id, auth.userId, auth.roleCode);
  if (access.response) return access.response;

  const parsed = updateContactSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);
  if (Object.keys(parsed.data).length === 0) return fail("Không có dữ liệu cần cập nhật");

  const changes: {
    type?: typeof parsed.data.type;
    name?: typeof parsed.data.name;
    phone?: typeof parsed.data.phone;
    email?: string | null;
  } = {};
  if (parsed.data.type !== undefined) changes.type = parsed.data.type;
  if (parsed.data.name !== undefined) changes.name = parsed.data.name;
  if (parsed.data.phone !== undefined) changes.phone = parsed.data.phone;
  if (Object.prototype.hasOwnProperty.call(parsed.data, "email")) {
    changes.email = parsed.data.email ?? null;
  }

  const { data, error } = await access.supabase
    .from("contacts")
    .update(changes)
    .eq("id", id)
    .select(CONTACT_SELECT)
    .single();

  if (error?.code === "23505") return fail("Số điện thoại này đã có trong sổ địa chỉ của bạn", 409);
  if (error) return fail(error.message, 500);
  return ok(data);
}

/** DELETE /api/contacts/:id — xóa contact nếu chưa tham gia đơn hàng. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageContacts(auth.roleCode)) return fail("Forbidden", 403);

  const { id } = await params;
  const access = await getAccessibleContact(id, auth.userId, auth.roleCode);
  if (access.response) return access.response;

  const { count, error: orderError } = await access.supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .or(`sender_id.eq.${id},receiver_id.eq.${id}`);
  if (orderError) return fail(orderError.message, 500);
  if ((count ?? 0) > 0) {
    return fail("Không thể xóa liên hệ đã xuất hiện trong đơn hàng để bảo toàn lịch sử giao nhận", 409);
  }

  const { error } = await access.supabase.from("contacts").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  return ok({ id });
}
