import { randomBytes } from "node:crypto";
import type {
  ForgotPasswordReqBody,
  VerifyPasswordRecoveryOtpReqBody,
} from "@/requests/auth.requests";
import {
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
} from "@/lib/password-reset";
import {
  sendPasswordRecoveryOtp,
  verifyPasswordRecoveryOtp,
} from "@/lib/supabase-password-recovery";
import { PasswordResetTokenRepository } from "@/repositories/password-reset-token.repository";
import { UserRepository } from "@/repositories/user.repository";

export const PASSWORD_RESET_REQUEST_MESSAGE =
  "Nếu email thuộc tài khoản đủ điều kiện, hướng dẫn xác minh sẽ được gửi đến địa chỉ đó.";

export class ForgotPasswordService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordResetTokens: PasswordResetTokenRepository,
  ) {}

  async requestOtp(input: ForgotPasswordReqBody): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findPublicByEmail(email);
    if (!user) return;

    await sendPasswordRecoveryOtp(email);
  }

  async verifyOtp(
    input: VerifyPasswordRecoveryOtpReqBody,
  ): Promise<string | null> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findPublicByEmail(email);
    if (!user) return null;

    const verified = await verifyPasswordRecoveryOtp(email, input.otp);
    if (!verified) return null;

    const resetToken = randomBytes(32).toString("base64url");
    await this.passwordResetTokens.create({
      user_id: user.id,
      token_hash: hashPasswordResetToken(resetToken),
      expires_at: new Date(
        Date.now() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000,
      ).toISOString(),
    });

    return resetToken;
  }
}
