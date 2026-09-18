import type { NextRequest } from "next/server";
import { normalizeRoleCode, RoleCode, updateProfileSchema, type AuthenticatedUser } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const USER_SELECT = "id, full_name, email, phone, province, warehouse_id, avatar, status, roles(code)";

type UserWithRole = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  province: string | null;
  warehouse_id: string | null;
  avatar: string | null;
  status: string;
  roles: { code: string } | null;
};

function toAuthenticatedUser(user: UserWithRole): AuthenticatedUser {
  const roleCode = normalizeRoleCode(user.roles?.code);

  if (!roleCode) {
    throw new Error("Tai khoan chua duoc gan vai tro hop le");
  }

  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    province: user.province,
    warehouse_id: user.warehouse_id,
    avatar: user.avatar,
    roleCode,
  };
}

/** GET /api/auth/me — xac minh lai phien va vai tro hien tai tu Supabase. */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { data: userRaw, error } = await getSupabaseServiceClient()
    .from("users")
    .select(USER_SELECT)
    .eq("id", auth.userId)
    .maybeSingle();

  if (error) return fail(error.message, 500);

  const user = userRaw as UserWithRole | null;
  if (!user || user.status !== "active") {
    return fail("Tai khoan khong con hoat dong", 401);
  }

  try {
    return ok({ user: toAuthenticatedUser(user) });
  } catch {
    return fail("Tai khoan chua duoc gan vai tro hop le", 403);
  }
}

/** PATCH /api/auth/me — cap nhat thong tin ca nhan cua chinh tai khoan hien tai. */
export async function PATCH(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.message);

  const updates: { full_name?: string; email?: string; phone?: string | null; province?: string | null } = {};
  if (parsed.data.full_name !== undefined) updates.full_name = parsed.data.full_name;
  if (parsed.data.email !== undefined) updates.email = parsed.data.email;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
  if (parsed.data.province !== undefined) {
    // Tinh phu trach la pham vi quyen, phai do admin cap; dieu phoi vien
    // khong duoc tu doi tinh de mo rong danh sach don/kho/nhan vien.
    if (auth.roleCode !== RoleCode.ADMIN) {
      return fail("Chỉ quản trị viên được cập nhật tỉnh phụ trách", 403);
    }
    updates.province = parsed.data.province;
  }
  if (Object.keys(updates).length === 0) return fail("Chưa có thông tin nào để cập nhật");

  const { data: userRaw, error } = await getSupabaseServiceClient()
    .from("users")
    .update(updates)
    .eq("id", auth.userId)
    .select(USER_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return fail("Email này đã được sử dụng", 409);
    return fail(error.message, 500);
  }

  const user = userRaw as UserWithRole | null;
  if (!user || user.status !== "active") {
    return fail("Tai khoan khong con hoat dong", 401);
  }

  try {
    return ok({ user: toAuthenticatedUser(user) });
  } catch {
    return fail("Tai khoan chua duoc gan vai tro hop le", 403);
  }
}
