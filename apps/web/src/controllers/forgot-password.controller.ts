import type { NextRequest } from "next/server";
import { DatabaseService } from "@/database/database.service";
import { fail, ok } from "@/lib/api-response";
import { PasswordResetTokenRepository } from "@/repositories/password-reset-token.repository";
import { UserRepository } from "@/repositories/user.repository";
import { ForgotPasswordService } from "@/services/forgot-password.service";
import { validateForgotPasswordInput } from "@/validations/auth.validation";

export async function forgotPasswordController(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const validation = validateForgotPasswordInput(body);
  if (!validation.success) return fail(validation.error, 400);

  try {
    const database = new DatabaseService();
    const result = await new ForgotPasswordService(
      new UserRepository(database),
      new PasswordResetTokenRepository(database),
    ).createResetToken(validation.data);

    return ok(result);
  } catch {
    return fail("Unable to create password reset token", 500);
  }
}
