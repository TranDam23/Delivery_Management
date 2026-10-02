"use client";

import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { forgotPasswordSchema, verifyPasswordRecoveryOtpSchema } from "@/validations/auth.validation";

interface ForgotPasswordResponse {
  success: boolean;
  data?: { message?: string };
  error?: string;
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.slice(0, 1)}${"*".repeat(Math.max(2, name.length - 1))}@${domain}`;
}

async function readApiPayload(response: Response): Promise<ForgotPasswordResponse | null> {
  return response.json().catch(() => null) as Promise<ForgotPasswordResponse | null>;
}

export default function ForgotPasswordPage(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendOtp(): Promise<void> {
    setError(null);
    setMessage(null);
    if (cooldown > 0) return;

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError("Vui lòng nhập một email hợp lệ.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parsed.data.email }),
      });
      const payload = await readApiPayload(response);
      if (!response.ok || !payload?.success) {
        setError(payload?.error ?? "Không thể gửi yêu cầu. Vui lòng thử lại.");
        return;
      }

      setEmail(parsed.data.email);
      setOtp("");
      setStep("otp");
      setCooldown(60);
      setMessage(
        payload.data?.message
          ?? "Nếu email thuộc tài khoản đủ điều kiện, hướng dẫn xác minh sẽ được gửi đến địa chỉ đó.",
      );
    } catch {
      setError("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const parsed = verifyPasswordRecoveryOtpSchema.safeParse({ email, otp });
    if (!parsed.success) {
      setError("Vui lòng nhập mã OTP gồm 6 đến 8 chữ số.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-password/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = await readApiPayload(response);
      if (!response.ok || !payload?.success) {
        setError(payload?.error ?? "Mã OTP không hợp lệ hoặc đã hết hạn.");
        return;
      }
      router.replace("/reset-password");
    } catch {
      setError("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090a0c] px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(223,179,41,0.08),transparent_34%)]" />
      <Link
        href="/login"
        className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[11px] text-dt-muted transition hover:border-dt-yellow/40 hover:text-dt-text"
      >
        <ArrowLeft size={15} strokeWidth={1.8} />
        Quay lại đăng nhập
      </Link>

      <section className="relative z-10 flex w-full max-w-[380px] flex-col items-center">
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-dt-yellow/10 text-dt-yellow">
            <ShieldCheck size={21} strokeWidth={2.2} />
          </div>
          <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-dt-text">DeliverTrust</h1>
          <p className="mt-1 text-[11px] tracking-wide text-dt-muted">Deliver. Track. Verify.</p>
        </div>

        <form
          onSubmit={step === "email" ? (event) => {
            event.preventDefault();
            void sendOtp();
          } : verifyOtp}
          className="w-full rounded-dt border border-[#2d2e31] bg-[#1a1a1a] p-6 shadow-[0_18px_55px_rgba(0,0,0,0.35)] sm:p-7"
          noValidate
        >
          <div className="mb-6">
            <h2 className="text-[18px] font-semibold text-dt-text">Quên mật khẩu</h2>
            <p className="mt-2 text-[11px] leading-5 text-dt-muted">
              {step === "email"
                ? "Nhập email để yêu cầu mã xác minh khôi phục mật khẩu."
                : `Nhập mã OTP khôi phục được gửi đến ${maskEmail(email)}.`}
            </p>
          </div>

          {step === "email" ? (
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-dt-muted">
                Email tài khoản
              </span>
              <span className="relative">
                <Mail
                  size={16}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#55565b]"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  maxLength={254}
                  className="h-[46px] w-full rounded-[4px] border border-[#414247] bg-[#f5f5f5] pl-10 pr-3 text-[13px] text-[#242529] outline-none transition placeholder:text-[#888a8f] focus:border-dt-yellow focus:ring-2 focus:ring-dt-yellow/20"
                />
              </span>
            </label>
          ) : (
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-dt-muted">
                Mã OTP khôi phục
              </span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Nhập mã xác minh"
                className="h-[46px] w-full rounded-[4px] border border-[#414247] bg-[#f5f5f5] px-3 text-center text-lg tracking-[0.45em] text-[#242529] outline-none transition placeholder:text-sm placeholder:tracking-normal placeholder:text-[#888a8f] focus:border-dt-yellow focus:ring-2 focus:ring-dt-yellow/20"
              />
              <button
                type="button"
                disabled={submitting || cooldown > 0}
                onClick={() => void sendOtp()}
                className="self-start text-[10px] font-semibold text-dt-yellow transition hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cooldown > 0 ? `Gửi lại mã sau ${cooldown} giây` : "Gửi lại mã OTP"}
              </button>
            </label>
          )}

          {error ? (
            <p role="alert" className="mt-4 rounded-[4px] border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[11px] leading-5 text-[#f38b8d]">
              {error}
            </p>
          ) : null}

          {message ? (
            <div role="status" className="mt-4 rounded-[4px] border border-[#2b806b]/50 bg-[#12372f] px-3 py-3 text-[11px] leading-5 text-[#b9f2de]">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#63d2b3]" />
                <span>{message}</span>
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || (step === "email" && cooldown > 0)}
            className="mt-5 flex h-[46px] w-full items-center justify-center gap-2 rounded-[4px] bg-dt-yellow text-[13px] font-semibold text-[#111216] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Đang xử lý..."
              : step === "email"
                ? cooldown > 0 ? `Gửi lại mã sau ${cooldown} giây` : "Gửi mã OTP"
                : <><ShieldCheck size={15} /> Xác minh OTP</>}
          </button>

          {step === "otp" ? (
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError(null);
                setMessage(null);
              }}
              className="mt-4 w-full text-center text-[10px] text-dt-muted transition hover:text-dt-yellow"
            >
              Quay lại nhập email
            </button>
          ) : null}

          <p className="mt-5 text-center text-[10px] text-dt-muted">
            <Link href="/login" className="text-dt-yellow/70 transition hover:text-dt-yellow hover:underline">
              Trở về đăng nhập
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
