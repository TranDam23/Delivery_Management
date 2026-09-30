import { createHash, randomBytes } from "node:crypto";
import type { ForgotPasswordReqBody } from "@/requests/auth.requests";
import { PasswordResetTokenRepository } from "@/repositories/password-reset-token.repository";
import { UserRepository } from "@/repositories/user.repository";

const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_MESSAGE =
  "If the email exists, a password reset token has been created.";

function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export class ForgotPasswordService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordResetTokens: PasswordResetTokenRepository,
  ) {}

  async createResetToken(
    input: ForgotPasswordReqBody,
  ): Promise<{ message: string; resetToken?: string }> {
    const user = await this.users.findPublicByEmail(
      input.email.trim().toLowerCase(),
    );
    if (!user) return { message: PASSWORD_RESET_MESSAGE };

    const resetToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_TTL_MS,
    ).toISOString();

    await this.passwordResetTokens.create({
      user_id: user.id,
      token_hash: hashPasswordResetToken(resetToken),
      expires_at: expiresAt,
    });

    return { message: PASSWORD_RESET_MESSAGE, resetToken };
  }
}
