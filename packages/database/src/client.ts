import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Browser/anon client — dung o phia client (RLS ap dung day du).
 * Can NEXT_PUBLIC_SUPABASE_URL va NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function createSupabaseBrowserClient(
  url: string,
  anonKey: string,
): SupabaseClient<Database> {
  return createClient<Database>(url, anonKey);
}

/**
 * Service-role client — CHI dung o server (Next.js Route Handlers/Server Actions).
 * Bo qua RLS, khong bao gio duoc expose ra client. Can SUPABASE_SERVICE_ROLE_KEY.
 */
export function createSupabaseServiceClient(
  url: string,
  serviceRoleKey: string,
): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type { Database } from "./database.types";
