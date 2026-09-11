import type { DatabaseService } from "@/database/database.service";
import type { User } from "@/models/schemas/User.schema";

export interface AuthUserRecord {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  phone: string | null;
  status: User["status"];
  roleCode: string | null;
}

export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const { data, error } = await this.database
      .getClient()
      .from("users")
      .select("id, full_name, email, password_hash, phone, status, roles(code)")
      .eq("email", email)
      .maybeSingle();

    if (error) throw new Error("Failed to load account");

    const record = data as unknown as {
      id: string;
      full_name: string;
      email: string;
      password_hash: string;
      phone: string | null;
      status: User["status"];
      roles: { code: string } | null;
    } | null;

    return record
      ? {
          id: record.id,
          full_name: record.full_name,
          email: record.email,
          password_hash: record.password_hash,
          phone: record.phone,
          status: record.status,
          roleCode: record.roles?.code ?? null,
        }
      : null;
  }

  async updateLastLoginAt(userId: string): Promise<void> {
    const { error } = await this.database
      .getClient()
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) throw new Error("Failed to update login timestamp");
  }
}
