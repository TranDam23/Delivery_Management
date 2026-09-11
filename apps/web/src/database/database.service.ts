import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { Database } from "@delivery/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export class DatabaseService {
  private readonly client: SupabaseClient<Database>;

  constructor(client = getSupabaseServiceClient()) {
    this.client = client;
  }

  getClient(): SupabaseClient<Database> {
    return this.client;
  }
}
