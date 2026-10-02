import { createClient } from "@supabase/supabase-js";
import type { Database } from "@delivery/database";

function createRecoveryClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase Auth recovery is not configured");
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function sendPasswordRecoveryOtp(email: string): Promise<void> {
  try {
    const { error } = await createRecoveryClient().auth.resetPasswordForEmail(email);
    if (error) {
      console.error("Password recovery email request failed", {
        code: error.code,
        status: error.status,
      });
      throw new Error("Password recovery email provider unavailable");
    }
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "Password recovery email provider unavailable"
    ) {
      throw error;
    }
    console.error("Password recovery email request failed", {
      reason: "provider_unavailable",
    });
    throw new Error("Password recovery email provider unavailable");
  }
}

export async function verifyPasswordRecoveryOtp(
  email: string,
  token: string,
): Promise<boolean> {
  const { data, error } = await createRecoveryClient().auth.verifyOtp({
    email,
    token,
    type: "recovery",
  });

  return !error
    && data.user?.email?.trim().toLowerCase() === email
    && Boolean(data.session);
}
