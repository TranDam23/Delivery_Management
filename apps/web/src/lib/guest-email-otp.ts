import { createClient } from "@supabase/supabase-js";
import type { Database } from "@delivery/database";

/** Supabase Auth OTP runs server-side; no login session is stored in the browser. */
function otpClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase Auth OTP is not configured");
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function sendEmailOtp(email: string): Promise<string | null> {
  const { error } = await otpClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    console.error("Email OTP delivery failed", { code: error.code, status: error.status });
    return "Không gửi được mã xác thực. Vui lòng thử lại sau hoặc kiểm tra cấu hình email.";
  }
  return null;
}

export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<{ userId: string; emailConfirmed: boolean } | null> {
  const { data, error } = await otpClient().auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user || data.user.email?.toLowerCase() !== email) return null;
  return {
    userId: data.user.id,
    emailConfirmed: Boolean(data.user.email_confirmed_at),
  };
}

export const sendGuestEmailOtp = sendEmailOtp;

export async function verifyGuestEmailOtp(
  email: string,
  token: string,
): Promise<{ userId: string } | null> {
  const result = await verifyEmailOtp(email, token);
  return result ? { userId: result.userId } : null;
}
