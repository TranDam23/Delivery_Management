"use client";

import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { forgotPasswordSchema } from "@/validations/auth.validation";

interface ForgotPasswordResponse {
  success: boolean;
  data?: {
    message?: string;
    resetToken?: string;
  };
  error?: string;
}

export default function ForgotPasswordPage(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setResetToken(null);

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
      const payload = (await response.json().catch(() => null)) as ForgotPasswordResponse | null;

      if (!response.ok || !payload?.success) {
        setError(payload?.error ?? "Không thể tạo yêu cầu đặt lại mật khẩu.");
        return;
      }

      setSuccessMessage(payload.data?.message ?? "Yêu cầu đặt lại mật khẩu đã được tạo.");
      if (payload.data?.resetToken) setResetToken(payload.data.resetToken);
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
          onSubmit={handleSubmit}
          className="w-full rounded-dt border border-[#2d2e31] bg-[#1a1a1a] p-7 shadow-[0_18px_55px_rgba(0,0,0,0.35)]"
          noValidate
        >
          <div className="mb-6">
            <h2 className="text-[18px] font-semibold text-dt-text">Quên mật khẩu</h2>
            <p className="mt-2 text-[11px] leading-5 text-dt-muted">
              Nhập email tài khoản để tạo yêu cầu đặt lại mật khẩu.
            </p>
          </div>

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
                className="h-[46px] w-full rounded-[4px] border border-[#414247] bg-[#f5f5f5] pl-10 pr-3 text-[13px] text-[#242529] outline-none transition placeholder:text-[#888a8f] focus:border-dt-yellow focus:ring-2 focus:ring-dt-yellow/20"
              />
            </span>
          </label>

          {error ? (
            <p role="alert" className="mt-4 rounded-[4px] border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[11px] leading-5 text-[#f38b8d]">
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <div role="status" className="mt-4 rounded-[4px] border border-[#2b806b]/50 bg-[#12372f] px-3 py-3 text-[11px] leading-5 text-[#b9f2de]">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#63d2b3]" />
                <span>{successMessage}</span>
              </div>
              {resetToken ? (
                <Link
                  href={`/reset-password?token=${encodeURIComponent(resetToken)}`}
                  className="mt-3 inline-flex font-semibold text-dt-yellow hover:underline"
                >
                  Tiếp tục đặt lại mật khẩu
                </Link>
              ) : null}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 flex h-[46px] w-full items-center justify-center rounded-[4px] bg-dt-yellow text-[13px] font-semibold text-[#111216] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Đang xử lý..." : "Tạo yêu cầu đặt lại"}
          </button>

          <p className="mt-5 text-center text-[10px] text-dt-muted">
            Chưa có tài khoản?{" "}
            <Link href="/register" className="text-dt-yellow/70 transition hover:text-dt-yellow hover:underline">
              Đăng ký ngay
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
