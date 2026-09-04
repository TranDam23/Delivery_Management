import type { NextRequest } from "next/server";
import type { AuthenticatedUser } from "@delivery/shared";
import { normalizeRoleCode } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type UserWithRole = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  status: string;
  roles: { code: string } | null;
};

/** GET /api/auth/me — xac minh lai phien va vai tro hien tai tu Supabase. */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { data: userRaw, error } = await getSupabaseServiceClient()
    .from("users")
    .select("id, full_name, email, phone, avatar, status, roles(code)")
    .eq("id", auth.userId)
    .maybeSingle();

  if (error) return fail(error.message, 500);

  const user = userRaw as UserWithRole | null;
  if (!user || user.status !== "active") {
    return fail("Tai khoan khong con hoat dong", 401);
  }

  const roleCode = normalizeRoleCode(user.roles?.code);
  if (!roleCode) {
    return fail("Tai khoan chua duoc gan vai tro hop le", 403);
  }

  const authenticatedUser: AuthenticatedUser = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    roleCode,
  };

  return ok({ user: authenticatedUser });
}
