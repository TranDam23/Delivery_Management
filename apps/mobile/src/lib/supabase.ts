import { createClient } from "@supabase/supabase-js";
import type { Database } from "@delivery/database";

/** Dung khi can realtime subscription (vd: theo doi trang thai don truc tiep). */
export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
);
