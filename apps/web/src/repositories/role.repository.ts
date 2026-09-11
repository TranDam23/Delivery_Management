import type { DatabaseService } from "@/database/database.service";

export interface RoleRecord {
  id: string;
  code: string;
}

export class RoleRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByCode(code: string): Promise<RoleRecord | null> {
    const { data, error } = await this.database
      .getClient()
      .from("roles")
      .select("id, code")
      .eq("code", code)
      .maybeSingle();

    if (error) throw new Error("Failed to load role configuration");
    return data;
  }
}
