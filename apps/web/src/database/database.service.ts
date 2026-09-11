import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { Database } from "@delivery/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export class DatabaseService {
  private readonly client: SupabaseClient<Database>;

  constructor(client?: SupabaseClient<Database>) {
    this.client = client ?? getSupabaseServiceClient();
  }

  getClient(): SupabaseClient<Database> {
    return this.client;
  }
}
