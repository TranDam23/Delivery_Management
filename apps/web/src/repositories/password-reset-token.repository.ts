import type { Database } from "@delivery/database";
import type { DatabaseService } from "@/database/database.service";

export type PasswordResetTokenRecord =
  Database["public"]["Tables"]["password_reset_tokens"]["Row"];

type PasswordResetTokenInsert =
  Database["public"]["Tables"]["password_reset_tokens"]["Insert"];

export class PasswordResetTokenRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: {
    user_id: PasswordResetTokenInsert["user_id"];
    token_hash: PasswordResetTokenInsert["token_hash"];
    expires_at: PasswordResetTokenInsert["expires_at"];
  }): Promise<PasswordResetTokenRecord> {
    const { data, error } = await this.database
      .getClient()
      .from("password_reset_tokens")
      .insert(input)
      .select("id, user_id, token_hash, expires_at, used_at, created_at")
      .single();

    if (error) throw new Error("Failed to create password reset token");
    return data;
  }

  async consumeAndUpdatePassword(
    tokenHash: PasswordResetTokenRecord["token_hash"],
    passwordHash: string,
  ): Promise<boolean> {
    const { data, error } = await this.database
      .getClient()
      .rpc("reset_password_with_token", {
        p_token_hash: tokenHash,
        p_password_hash: passwordHash,
      });

    if (error) throw new Error("Failed to reset password");
    return data === true;
  }
}
