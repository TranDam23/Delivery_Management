import type { NextRequest } from "next/server";
import { DatabaseService } from "@/database/database.service";
import { fail, ok } from "@/lib/api-response";
import { PASSWORD_RESET_COOKIE } from "@/lib/password-reset";
import { PasswordResetTokenRepository } from "@/repositories/password-reset-token.repository";
import { ResetPasswordService } from "@/services/reset-password.service";
import { validateResetPasswordInput } from "@/validations/auth.validation";

export async function resetPasswordController(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const validation = validateResetPasswordInput(body);
  if (!validation.success) return fail(validation.error, 400);
  const resetToken = request.cookies.get(PASSWORD_RESET_COOKIE)?.value;
  if (!resetToken) {
    return fail("Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", 401);
  }

  try {
    const database = new DatabaseService();
    const result = await new ResetPasswordService(
      new PasswordResetTokenRepository(database),
    ).resetPassword(validation.data, resetToken);

    const response = ok(result);
    response.cookies.set(PASSWORD_RESET_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/reset-password",
      maxAge: 0,
      expires: new Date(0),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Invalid or expired password reset token") {
      return fail(message, 401);
    }
    if (message === "New password and confirm password do not match") {
      return fail(message, 400);
    }
    return fail("Unable to reset password", 500);
  }
}
