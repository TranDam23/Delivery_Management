"use client";

import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { AuthenticatedUser } from "@delivery/shared";
import { getStoredUser, getToken, setStoredUser, setToken } from "@/lib/api-client";
import { roleHomePath } from "@/lib/role-routing";
import { useRouter } from "next/navigation";

interface LoginData {
  token: string;
  user: AuthenticatedUser;
}

type LoginApiResponse =
  | { success: true; data: LoginData; error?: never }
  | { success: false; error?: string; data?: never };

/** Man dang nhap chinh cua DeliverTrust — chi xu ly email va mat khau. */
export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = getStoredUser<AuthenticatedUser>();
    if (getToken() && storedUser?.roleCode) {
      router.replace(roleHomePath(storedUser.roleCode));
    }
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = (await response.json().catch(() => null)) as LoginApiResponse | null;

      if (!response.ok || !payload || !payload.success) {
        setError(payload?.error ?? "Email hoặc mật khẩu không đúng.");
        return;
      }

      setToken(payload.data.token, rememberMe);
      setStoredUser(payload.data.user, rememberMe);
      router.replace(roleHomePath(payload.data.user.roleCode));
    } catch {
      setError("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090a0c] px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(223,179,41,0.08),transparent_34%)]" />
      <span className="absolute left-6 top-4 text-[12px] text-white/[0.12]">login</span>

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
        >
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-dt-muted">
                Email đăng nhập
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
                  placeholder="admin@delivertrust.com"
                  autoComplete="email"
                  className="h-[46px] w-full rounded-[4px] border border-[#414247] bg-[#f5f5f5] pl-10 pr-3 text-[13px] text-[#242529] outline-none transition placeholder:text-[#888a8f] focus:border-dt-yellow focus:ring-2 focus:ring-dt-yellow/20"
                />
              </span>
            </label>

            <label className="flex flex-col gap-2">
              <span className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.08em] text-dt-muted">
                <span>Mật khẩu</span>
                <span
                  title="Chức năng khôi phục mật khẩu sẽ được bổ sung sau"
                  className="normal-case tracking-normal text-[10px] text-dt-yellow/70"
                >
                  Quên mật khẩu?
                </span>
              </span>
              <span className="relative">
                <LockKeyhole
                  size={16}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#55565b]"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  className="h-[46px] w-full rounded-[4px] border border-[#414247] bg-[#f5f5f5] pl-10 pr-11 text-[13px] tracking-[0.12em] text-[#242529] outline-none transition placeholder:tracking-normal placeholder:text-[#888a8f] focus:border-dt-yellow focus:ring-2 focus:ring-dt-yellow/20"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55565b] transition hover:text-[#242529]"
                >
                  {showPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                </button>
              </span>
            </label>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-[4px] border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[11px] leading-5 text-[#f38b8d]"
            >
              {error}
            </p>
          ) : null}

          <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-[10px] text-dt-muted">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-3 w-3 accent-[var(--dt-yellow)]"
            />
            Ghi nhớ đăng nhập
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 flex h-[46px] w-full items-center justify-center rounded-[4px] bg-dt-yellow text-[13px] font-semibold text-[#111216] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>

          <p className="mt-5 text-center text-[10px] text-dt-muted">
            Chưa có tài khoản? <span className="text-dt-yellow/70">Đăng ký ngay</span>
          </p>
        </form>

        <p className="mt-7 text-[9px] tracking-wide text-white/[0.18]">
          © 2024 DELIVERTRUST · ENTERPRISE GRADE SECURITY
        </p>
      </section>
    </main>
  );
}
