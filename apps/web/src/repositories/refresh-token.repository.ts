import type { Database } from "@delivery/database";
import type { DatabaseService } from "@/database/database.service";

export type RefreshTokenRecord =
  Database["public"]["Tables"]["refresh_tokens"]["Row"];

type RefreshTokenInsert =
  Database["public"]["Tables"]["refresh_tokens"]["Insert"];

export class RefreshTokenRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: {
    user_id: RefreshTokenInsert["user_id"];
    token_hash: RefreshTokenInsert["token_hash"];
    expires_at: RefreshTokenInsert["expires_at"];
  }): Promise<RefreshTokenRecord> {
    const { data, error } = await this.database
      .getClient()
      .from("refresh_tokens")
      .insert(input)
      .select("id, user_id, token_hash, expires_at, revoked_at, created_at")
      .single();

    if (error) throw new Error("Failed to create refresh token record");
    return data;
  }

  async findByTokenHash(
    tokenHash: RefreshTokenRecord["token_hash"],
  ): Promise<RefreshTokenRecord | null> {
    const { data, error } = await this.database
      .getClient()
      .from("refresh_tokens")
      .select("id, user_id, token_hash, expires_at, revoked_at, created_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) throw new Error("Failed to load refresh token record");
    return data;
  }

  async revokeById(id: RefreshTokenRecord["id"]): Promise<void> {
    const { error } = await this.database
      .getClient()
      .from("refresh_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error("Failed to revoke refresh token record");
  }

  async revokeAllByUserId(userId: RefreshTokenRecord["user_id"]): Promise<void> {
    const { error } = await this.database
      .getClient()
      .from("refresh_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("revoked_at", null);

    if (error) throw new Error("Failed to revoke user refresh tokens");
  }
}
