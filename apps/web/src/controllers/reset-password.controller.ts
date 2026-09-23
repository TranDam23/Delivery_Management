import type { NextRequest } from "next/server";
import { DatabaseService } from "@/database/database.service";
import { fail, ok } from "@/lib/api-response";
import { PasswordResetTokenRepository } from "@/repositories/password-reset-token.repository";
import { UserRepository } from "@/repositories/user.repository";
import { ResetPasswordService } from "@/services/reset-password.service";
import { validateResetPasswordInput } from "@/validations/auth.validation";

export async function resetPasswordController(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const validation = validateResetPasswordInput(body);
  if (!validation.success) return fail(validation.error, 400);

  try {
    const database = new DatabaseService();
    const result = await new ResetPasswordService(
      new UserRepository(database),
      new PasswordResetTokenRepository(database),
    ).resetPassword(validation.data);

    return ok(result);
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
