import type { DatabaseService } from "@/database/database.service";
import type { PublicUser, User } from "@/models/schemas/User.schema";

export interface PasswordUserRecord {
  id: string;
  password_hash: string;
  status: User["status"];
}

export class UserRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByEmail(email: string): Promise<Pick<User, "id"> | null> {
    const { data, error } = await this.database
      .getClient()
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (error) throw new Error("Failed to check account email");
    return data;
  }

  async findPublicByEmail(email: string): Promise<PublicUser | null> {
    const { data, error } = await this.database
      .getClient()
      .from("users")
      .select(
        "id, role_id, full_name, email, phone, avatar, status, created_at, updated_at, last_login_at",
      )
      .eq("email", email)
      .maybeSingle();

    if (error) throw new Error("Failed to load account");
    return data;
  }

  async findById(id: string): Promise<PublicUser | null> {
    const { data, error } = await this.database
      .getClient()
      .from("users")
      .select(
        "id, role_id, full_name, email, phone, avatar, status, created_at, updated_at, last_login_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error("Failed to load account");
    return data;
  }

  async findPasswordUserById(id: string): Promise<PasswordUserRecord | null> {
    const { data, error } = await this.database
      .getClient()
      .from("users")
      .select("id, password_hash, status")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error("Failed to load account");
    return data;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const { error } = await this.database
      .getClient()
      .from("users")
      .update({ password_hash: passwordHash })
      .eq("id", id);

    if (error) throw new Error("Failed to update password");
  }

  async updateProfile(
    id: string,
    input: {
      full_name?: string;
      phone?: string | null;
      avatar?: string | null;
    },
  ): Promise<void> {
    const { error } = await this.database
      .getClient()
      .from("users")
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw new Error("Failed to update profile");
  }

  async createUser(input: {
    role_id: string;
    full_name: string;
    email: string;
    password_hash: string;
    phone: string | null;
    status: User["status"];
  }): Promise<PublicUser> {
    const { data, error } = await this.database
      .getClient()
      .from("users")
      .insert(input)
      .select("id, role_id, full_name, email, phone, avatar, status, created_at, updated_at, last_login_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("An account with this email already exists");
      }
      throw new Error("Failed to create account");
    }

    return data;
  }
}
