import { hashPassword } from "@/lib/auth";
import { hashPasswordResetToken } from "@/lib/password-reset";
import type { ResetPasswordReqBody } from "@/requests/auth.requests";
import { PasswordResetTokenRepository } from "@/repositories/password-reset-token.repository";

const INVALID_RESET_TOKEN_ERROR = "Invalid or expired password reset token";

export class ResetPasswordService {
  constructor(
    private readonly passwordResetTokens: PasswordResetTokenRepository,
  ) {}

  async resetPassword(
    input: ResetPasswordReqBody,
    resetToken: string,
  ): Promise<{ message: string }> {
    if (input.newPassword !== input.confirmPassword) {
      throw new Error("New password and confirm password do not match");
    }

    if (!/^[A-Za-z0-9_-]{43}$/.test(resetToken)) {
      throw new Error(INVALID_RESET_TOKEN_ERROR);
    }

    const reset = await this.passwordResetTokens.consumeAndUpdatePassword(
      hashPasswordResetToken(resetToken),
      await hashPassword(input.newPassword),
    );
    if (!reset) throw new Error(INVALID_RESET_TOKEN_ERROR);

    return { message: "Password reset successfully" };
  }
}
