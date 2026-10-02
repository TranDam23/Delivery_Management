import { createHash } from "node:crypto";

export const PASSWORD_RESET_COOKIE = "delivertrust_password_reset";
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 10 * 60;

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
