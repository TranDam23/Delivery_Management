import type { NextRequest } from "next/server";
import { z } from "zod";
import type { AuthenticatedUser } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { signAuthToken, verifyPassword } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { normalizeRoleCode } from "@delivery/shared";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.message);

  const email = parsed.data.email.trim().toLowerCase();

  const supabase = getSupabaseServiceClient();
  const { data: userRaw, error } = await supabase
    .from("users")
    .select("id, full_name, email, password_hash, phone, avatar, status, role_id, roles(code)")
    .eq("email", email)
    .maybeSingle();
  const user = userRaw as
    | {
        id: string;
        full_name: string;
        email: string;
        password_hash: string;
        phone: string | null;
        avatar: string | null;
        status: string;
        role_id: string;
        roles: { code: string } | null;
      }
    | null;

  if (error) return fail(error.message, 500);
  if (!user || user.status !== "active") return fail("Email hoac mat khau khong dung", 401);

  const passwordOk = await verifyPassword(parsed.data.password, user.password_hash);
  if (!passwordOk) return fail("Email hoac mat khau khong dung", 401);

  // Khong cap token khi tai khoan chua duoc gan vai tro hop le: roleCode rong
  // se lam cac guard theo vai tro o nhom Giao nhan truot qua im lang.
  const roleCode = normalizeRoleCode(user.roles?.code);
  if (!roleCode) {
    return fail("Tai khoan chua duoc gan vai tro hop le", 403);
  }

  // Cap nhat thoi diem dang nhap de phuc vu quan tri tai khoan. Loi cap nhat
  // nay khong nen chan viec dang nhap neu giao dien chinh van hoat dong.
  await supabase
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  const token = signAuthToken({ userId: user.id, roleCode });

  const authenticatedUser: AuthenticatedUser = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    roleCode,
  };

  return ok({
    token,
    user: authenticatedUser,
  });
}
