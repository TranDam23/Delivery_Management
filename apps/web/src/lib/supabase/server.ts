import { createSupabaseServiceClient, type Database } from "@delivery/database";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client dung trong Route Handlers / Server Actions. Dung service role key
 * nen bo qua RLS — MOI kiem tra quyen phai thuc hien o tang API (xem
 * src/lib/auth.ts) truoc khi goi cac ham trong lib nay.
 */
export function getSupabaseServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars",
    );
  }

  return createSupabaseServiceClient(url, serviceRoleKey);
}
