"use client";

import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { resetPasswordSchema } from "@/validations/auth.validation";

interface ResetPasswordResponse {
  success: boolean;
  data?: { message?: string };
  error?: string;
}

export default function ResetPasswordPage(): React.JSX.Element {
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) setResetToken(token);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const parsed = resetPasswordSchema.safeParse({
      resetToken,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      const mismatch = parsed.error.issues.some((issue) => issue.path[0] === "confirmPassword");
      setError(mismatch ? "Mật khẩu xác nhận không khớp." : "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và chữ số.");
      return;
    }

    if (parsed.data.newPassword !== parsed.data.confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json().catch(() => null)) as ResetPasswordResponse | null;

      if (!response.ok || !payload?.success) {
        setError(payload?.error ?? "Không thể đặt lại mật khẩu.");
        return;
      }

      setSuccessMessage(payload.data?.message ?? "Đặt lại mật khẩu thành công.");
      setNewPassword("");
      setConfirmPassword("");
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
            <h2 className="text-[18px] font-semibold text-dt-text">Đặt lại mật khẩu</h2>
            <p className="mt-2 text-[11px] leading-5 text-dt-muted">
              Tạo mật khẩu mới đáp ứng tiêu chuẩn bảo mật của tài khoản.
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-dt-muted">Mã đặt lại mật khẩu</span>
            <span className="relative">
              <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#55565b]" />
              <input
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
                placeholder="Dán mã đặt lại mật khẩu"
                autoComplete="one-time-code"
                className="h-[46px] w-full rounded-[4px] border border-[#414247] bg-[#f5f5f5] pl-10 pr-3 text-[13px] text-[#242529] outline-none transition placeholder:text-[#888a8f] focus:border-dt-yellow focus:ring-2 focus:ring-dt-yellow/20"
              />
            </span>
          </label>

          <label className="mt-5 flex flex-col gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-dt-muted">Mật khẩu mới</span>
            <span className="relative">
              <LockKeyhole size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#55565b]" />
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                autoComplete="new-password"
                className="h-[46px] w-full rounded-[4px] border border-[#414247] bg-[#f5f5f5] pl-10 pr-11 text-[13px] tracking-[0.12em] text-[#242529] outline-none transition placeholder:tracking-normal placeholder:text-[#888a8f] focus:border-dt-yellow focus:ring-2 focus:ring-dt-yellow/20"
              />
              <button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55565b] hover:text-[#242529]">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          <label className="mt-5 flex flex-col gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-dt-muted">Xác nhận mật khẩu</span>
            <span className="relative">
              <LockKeyhole size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#55565b]" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Nhập lại mật khẩu"
                autoComplete="new-password"
                className="h-[46px] w-full rounded-[4px] border border-[#414247] bg-[#f5f5f5] pl-10 pr-11 text-[13px] tracking-[0.12em] text-[#242529] outline-none transition placeholder:tracking-normal placeholder:text-[#888a8f] focus:border-dt-yellow focus:ring-2 focus:ring-dt-yellow/20"
              />
              <button type="button" aria-label={showConfirmPassword ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"} onClick={() => setShowConfirmPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55565b] hover:text-[#242529]">
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
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
              <Link href="/login" className="mt-3 inline-flex font-semibold text-dt-yellow hover:underline">
                Quay lại đăng nhập
              </Link>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 flex h-[46px] w-full items-center justify-center rounded-[4px] bg-dt-yellow text-[13px] font-semibold text-[#111216] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Đang cập nhật..." : "Đặt lại mật khẩu"}
          </button>
        </form>
      </section>
    </main>
  );
}
