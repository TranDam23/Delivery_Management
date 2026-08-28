import type { NextRequest } from "next/server";
import {
  ContactType,
  RoleCode,
  createContactSchema,
  listContactsQuerySchema,
} from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";

/**
 * Lien he kem dia chi mac dinh. Phai chi ro ten khoa ngoai:
 * contacts <-> addresses co hai quan he (addresses.contact_id va
 * contacts.default_address_id) nen Supabase khong tu doan duoc lay quan he nao.
 */
const CONTACT_SELECT =
  "id, user_id, type, name, phone, email, default_address_id, created_at, updated_at, " +
  "default_address:addresses!contacts_default_address_id_fkey(" +
  "id, contact_id, recipient_name, phone, address_line, ward, district, province, " +
  "latitude, longitude, is_default, created_at, updated_at)";

/** Dieu phoi/admin nhin duoc so dia chi cua moi khach hang de tao don ho. */
function seesAllContacts(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.DISPATCHER;
}

/** Vai tro 'both' phai xuat hien ca khi loc 'sender' lan khi loc 'receiver'. */
function typeFilterValues(type: ContactType): ContactType[] {
  if (type === ContactType.BOTH) return [ContactType.BOTH];
  return [type, ContactType.BOTH];
}

/** GET /api/contacts — so dia chi cua nguoi dang dang nhap (tim kiem, loc vai tro, phan trang). */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const parsedQuery = listContactsQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsedQuery.success) return fail(parsedQuery.error.message);
  const { q, type, page, pageSize } = parsedQuery.data;

  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from("contacts")
    .select(CONTACT_SELECT, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (!seesAllContacts(auth.roleCode)) {
    query = query.eq("user_id", auth.userId);
  }

  if (type) {
    query = query.in("type", typeFilterValues(type));
  }

  if (q) {
    // escape dau phay: chuoi tim kiem di thang vao cu phap or() cua PostgREST.
    const keyword = q.replace(/,/g, " ");
    query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%,email.ilike.%${keyword}%`);
  }

  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);

  return ok({ items: data ?? [], total: count ?? 0, page, pageSize });
}

/**
 * POST /api/contacts — them nguoi gui/nguoi nhan vao so dia chi.
 *
 * Day la duong DUY NHAT tao contact (docs/PHOI-HOP.md muc 2.1): luong tao don
 * chon lai lien he co san chu khong tu insert, neu khong so dia chi se day
 * ban trung cua cung mot nguoi.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const parsed = createContactSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      user_id: auth.userId,
      type: parsed.data.type,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email ?? null,
    })
    .select(CONTACT_SELECT)
    .single();

  // 23505 = unique_violation tren idx_contacts_user_id_phone.
  if (error?.code === "23505") {
    return fail("Số điện thoại này đã có trong sổ địa chỉ của bạn", 409);
  }
  if (error) return fail(error.message, 500);

  return ok(data, 201);
}
