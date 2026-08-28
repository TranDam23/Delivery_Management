import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { signAuthToken, verifyPassword } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { isRoleCode } from "@delivery/shared";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const supabase = getSupabaseServiceClient();
  const { data: userRaw, error } = await supabase
    .from("users")
    .select("id, full_name, email, password_hash, phone, avatar, status, role_id, roles(code)")
    .eq("email", parsed.data.email)
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
  const roleCode = user.roles?.code;
  if (!isRoleCode(roleCode)) {
    return fail("Tai khoan chua duoc gan vai tro hop le", 403);
  }

  const token = signAuthToken({ userId: user.id, roleCode });

  return ok({
    token,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      roleCode,
    },
  });
}
