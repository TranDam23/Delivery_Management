import type { NextRequest } from "next/server";
import { changePasswordSchema } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest, hashPassword, verifyPassword } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** POST /api/auth/password — doi mat khau sau khi xac minh mat khau hien tai. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.message);
  if (parsed.data.current_password === parsed.data.new_password) {
    return fail("Mật khẩu mới phải khác mật khẩu hiện tại");
  }

  const supabase = getSupabaseServiceClient();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("password_hash, status")
    .eq("id", auth.userId)
    .maybeSingle();

  if (userError) return fail(userError.message, 500);
  if (!user || user.status !== "active") return fail("Tai khoan khong con hoat dong", 401);

  const passwordOk = await verifyPassword(parsed.data.current_password, user.password_hash);
  if (!passwordOk) return fail("Mật khẩu hiện tại không đúng");

  const passwordHash = await hashPassword(parsed.data.new_password);
  const { error: updateError } = await supabase
    .from("users")
    .update({ password_hash: passwordHash })
    .eq("id", auth.userId);

  if (updateError) return fail(updateError.message, 500);

  return ok({ message: "Đổi mật khẩu thành công" });
}
