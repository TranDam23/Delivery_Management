import type { DatabaseService } from "@/database/database.service";
import type { PublicUser, User } from "@/models/schemas/User.schema";

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
