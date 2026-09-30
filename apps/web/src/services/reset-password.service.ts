import { hashPassword, hashRefreshToken } from "@/lib/auth";
import type { ResetPasswordReqBody } from "@/requests/auth.requests";
import { PasswordResetTokenRepository } from "@/repositories/password-reset-token.repository";
import { UserRepository } from "@/repositories/user.repository";

const INVALID_RESET_TOKEN_ERROR = "Invalid or expired password reset token";

export class ResetPasswordService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordResetTokens: PasswordResetTokenRepository,
  ) {}

  async resetPassword(
    input: ResetPasswordReqBody,
  ): Promise<{ message: string }> {
    const token = await this.passwordResetTokens.findByTokenHash(
      hashRefreshToken(input.resetToken),
    );

    if (
      !token ||
      token.used_at !== null ||
      new Date(token.expires_at).getTime() <= Date.now()
    ) {
      throw new Error(INVALID_RESET_TOKEN_ERROR);
    }

    const user = await this.users.findById(token.user_id);
    if (!user) throw new Error(INVALID_RESET_TOKEN_ERROR);

    if (input.newPassword !== input.confirmPassword) {
      throw new Error("New password and confirm password do not match");
    }

    await this.users.updatePasswordHash(
      user.id,
      await hashPassword(input.newPassword),
    );
    await this.passwordResetTokens.markAsUsed(token.id);

    return { message: "Password reset successfully" };
  }
}
