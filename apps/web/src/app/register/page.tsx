"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleUserRound,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Mail,
  Network,
  Phone,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface FormValues {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
}

type FormErrors = Partial<Record<keyof FormValues, string>>;

type RegisterResponse =
  | { success: true; data: { message: string }; error?: never }
  | { success: false; error?: string; data?: never };

const INITIAL_VALUES: FormValues = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  terms: false,
};

const FEATURES = [
  {
    icon: WalletCards,
    tone: "gold",
    title: "Định danh vận hành rõ ràng",
    description: "Mỗi tài khoản được gắn với một danh tính riêng để các bên phối hợp đúng phạm vi.",
    status: "Định danh sẵn sàng",
  },
  {
    icon: KeyRound,
    tone: "blue",
    title: "Bảo mật bằng cặp khóa",
    description: "Thông tin tài khoản được bảo vệ theo các lớp xác thực của nền tảng DeliverTrust.",
    status: "Bảo mật nhiều lớp",
  },
  {
    icon: Fingerprint,
    tone: "green",
    title: "Hành trình có thể kiểm chứng",
    description: "Các mốc giao nhận quan trọng được thiết kế để đối chiếu và xác minh minh bạch.",
    status: "Sẵn sàng xác minh",
  },
] as const;

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.fullName.trim()) errors.fullName = "Vui lòng nhập họ và tên.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = "Email không hợp lệ.";
  }
  if (values.password.length < 8) {
    errors.password = "Mật khẩu cần tối thiểu 8 ký tự.";
  } else if (!/[A-Z]/.test(values.password) || !/[a-z]/.test(values.password) || !/[0-9]/.test(values.password)) {
    errors.password = "Cần có chữ hoa, chữ thường và chữ số.";
  }
  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
  }
  if (!values.terms) errors.terms = "Bạn cần đồng ý với điều khoản sử dụng.";
  return errors;
}

function fieldClass(error?: string): string {
  return [
    "h-11 w-full rounded-dt border bg-dt-panel2 px-3 text-[12px] text-dt-text outline-none transition",
    "placeholder:text-dt-muted focus:border-dt-yellow focus:ring-2 focus:ring-dt-yellow/15",
    error ? "border-dt-red" : "border-dt-border",
  ].join(" ");
}

export default function RegisterPage(): React.JSX.Element {
  const router = useRouter();
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  function updateValue<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setApiError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validationErrors = validate(values);
    setErrors(validationErrors);
    setApiError(null);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: values.fullName.trim(),
          email: values.email.trim().toLowerCase(),
          phone: values.phone.trim() || null,
          password: values.password,
          confirm_password: values.confirmPassword,
        }),
      });
      const payload = (await response.json().catch(() => null)) as RegisterResponse | null;

      if (!response.ok || !payload || !payload.success) {
        setApiError(payload?.error ?? "Không thể tạo tài khoản. Vui lòng thử lại.");
        return;
      }

      setSuccess(true);
      window.setTimeout(() => router.push("/login"), 1200);
    } catch {
      setApiError("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-dt-bg text-dt-text">
      <header className="border-b border-dt-border/80 bg-dt-bg/90 backdrop-blur">
        <div className="mx-auto flex min-h-[58px] max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-dt-yellow text-sm font-black text-dt-bg">
              <ShieldCheck size={17} />
            </span>
            <span className="text-[13px] font-semibold tracking-tight">DeliverTrust</span>
            <span className="hidden items-center gap-1.5 rounded-full bg-dt-green/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-dt-green sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-dt-green" /> Node active
            </span>
          </Link>
          <nav className="hidden items-center gap-5 text-[10px] text-dt-muted lg:flex" aria-label="Điều hướng đăng ký">
            <Link href="/login" className="transition hover:text-dt-yellow">Đăng nhập</Link>
            <span className="rounded-md bg-dt-panel2 px-3 py-2 text-dt-yellow">Đăng ký tổ chức</span>
            <a href="#blockchain" className="transition hover:text-dt-yellow">Tra cứu Blockchain</a>
            <a href="#support" className="transition hover:text-dt-yellow">Hỗ trợ kỹ thuật</a>
          </nav>
          <div className="hidden items-center gap-3 text-[9px] text-[#9aa8bd] sm:flex">
            <span className="flex items-center gap-1.5"><LockKeyhole size={12} className="text-dt-green" /> ISO/IEC 27001</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-dt-yellow text-dt-bg"><CircleUserRound size={15} /></span>
          </div>
        </div>
      </header>

      <div className="pointer-events-none absolute left-1/3 top-24 hidden h-96 w-96 rounded-full bg-dt-yellow/5 blur-3xl lg:block" />
      <div className="pointer-events-none absolute right-0 top-48 hidden h-96 w-96 rounded-full bg-dt-panel/60 blur-3xl lg:block" />

      <section className="relative mx-auto grid max-w-[1240px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(290px,0.78fr)_minmax(0,1.12fr)] lg:px-8 lg:py-6">
        <aside className="flex flex-col gap-4">
          <div className="rounded-dt border border-dt-border bg-dt-panel/95 p-5 shadow-2xl shadow-black/10 sm:p-6">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#172a42] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-dt-yellow">
              <Network size={11} /> Hạ tầng xác thực phân tán
            </p>
            <h1 className="mt-4 max-w-md text-2xl font-semibold leading-tight tracking-[-0.03em] text-[#ecf1ff] sm:text-[28px]">
              Tham gia hệ thống giao nhận chuẩn minh bạch
            </h1>
            <p className="mt-3 max-w-lg text-[11px] leading-5 text-dt-muted">
              Mỗi thành viên được xác thực theo đúng vai trò để phối hợp giao nhận rõ ràng, an toàn và có thể kiểm chứng.
            </p>

            <div className="mt-6 space-y-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                const toneClass = feature.tone === "gold"
                  ? "bg-[#523f1e] text-dt-yellow"
                  : feature.tone === "blue"
                    ? "bg-[#103c5c] text-[#52c9ed]"
                    : "bg-[#0c4b4c] text-[#55d4bd]";
                return (
                  <article key={feature.title} className="rounded-dt border border-dt-border bg-dt-panel2 p-3.5">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${toneClass}`}><Icon size={16} /></span>
                      <div className="min-w-0">
                        <h2 className="text-[11px] font-semibold text-[#e5ebfa]">{feature.title}</h2>
                        <p className="mt-1 text-[10px] leading-4 text-[#8290a8]">{feature.description}</p>
                        <p className="mt-2 flex items-center gap-1 text-[9px] text-[#62cfb0]"><CheckCircle2 size={11} />{feature.status}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-dt border border-dt-border bg-dt-panel/95 px-4 py-3.5 text-[10px]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#263650] text-dt-yellow"><Network size={15} /></span>
              <span><span className="block text-[#8796ad]">Trạng thái mạng lưới</span><strong className="mt-0.5 block text-[#e5ebfa]">Đang sẵn sàng xác thực</strong></span>
            </div>
            <span className="text-right text-[#63d2b3]">Bảo mật<br /><span className="text-[#94a1b7]">theo thiết kế</span></span>
          </div>
        </aside>

        <section className="rounded-dt border border-dt-border bg-dt-panel/95 p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[#3a3020] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-dt-yellow"><ShieldCheck size={11} /> Cấp phát danh tính</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#edf2ff]">Đăng ký tài khoản mới</h2>
              <p className="mt-1 text-[11px] text-dt-muted">Khởi tạo tài khoản để tham gia hệ sinh thái giao nhận của DeliverTrust.</p>
            </div>
            <span className="hidden rounded-md border border-[#253652] p-2 text-dt-yellow sm:block"><UserRound size={18} /></span>
          </div>

          {success ? (
            <div className="mt-8 rounded-md border border-[#2b806b]/50 bg-[#12372f] p-5 text-center">
              <CheckCircle2 className="mx-auto text-[#63d2b3]" size={28} />
              <p className="mt-3 text-sm font-semibold text-[#b9f2de]">Đăng ký tài khoản thành công</p>
              <p className="mt-1 text-[11px] text-[#8fcbb9]">Đang chuyển bạn đến trang đăng nhập...</p>
            </div>
          ) : (
            <form className="mt-7" onSubmit={handleSubmit} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-[10px] font-medium text-[#b7c1d3]">Họ và tên <span className="text-dt-yellow">*</span></span>
                  <span className="relative block">
                    <UserRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#74829a]" />
                    <input value={values.fullName} onChange={(event) => updateValue("fullName", event.target.value)} placeholder="Nguyễn Văn An" className={`${fieldClass(errors.fullName)} pl-9`} autoComplete="name" />
                  </span>
                  {errors.fullName ? <span className="mt-1 block text-[10px] text-[#ff8e91]">{errors.fullName}</span> : null}
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-medium text-[#b7c1d3]">Email liên hệ <span className="text-dt-yellow">*</span></span>
                  <span className="relative block">
                    <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#74829a]" />
                    <input type="email" value={values.email} onChange={(event) => updateValue("email", event.target.value)} placeholder="doanhnghiep@delivertrust.vn" className={`${fieldClass(errors.email)} pl-9`} autoComplete="email" />
                  </span>
                  {errors.email ? <span className="mt-1 block text-[10px] text-[#ff8e91]">{errors.email}</span> : null}
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-medium text-[#b7c1d3]">Số điện thoại</span>
                  <span className="relative block">
                    <Phone size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#74829a]" />
                    <input type="tel" value={values.phone} onChange={(event) => updateValue("phone", event.target.value)} placeholder="0912 345 678" className={`${fieldClass()} pl-9`} autoComplete="tel" />
                  </span>
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-medium text-[#b7c1d3]">Mật khẩu tài khoản <span className="text-dt-yellow">*</span></span>
                  <span className="relative block">
                    <LockKeyhole size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#74829a]" />
                    <input type={showPassword ? "text" : "password"} value={values.password} onChange={(event) => updateValue("password", event.target.value)} placeholder="Tối thiểu 8 ký tự" className={`${fieldClass(errors.password)} pl-9 pr-9`} autoComplete="new-password" />
                    <button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#74829a] hover:text-dt-yellow">{showPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  </span>
                  {errors.password ? <span className="mt-1 block text-[10px] text-[#ff8e91]">{errors.password}</span> : null}
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-medium text-[#b7c1d3]">Xác nhận mật khẩu <span className="text-dt-yellow">*</span></span>
                  <span className="relative block">
                    <LockKeyhole size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#74829a]" />
                    <input type={showConfirmPassword ? "text" : "password"} value={values.confirmPassword} onChange={(event) => updateValue("confirmPassword", event.target.value)} placeholder="Nhập lại mật khẩu" className={`${fieldClass(errors.confirmPassword)} pl-9 pr-9`} autoComplete="new-password" />
                    <button type="button" aria-label={showConfirmPassword ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"} onClick={() => setShowConfirmPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#74829a] hover:text-dt-yellow">{showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  </span>
                  {errors.confirmPassword ? <span className="mt-1 block text-[10px] text-[#ff8e91]">{errors.confirmPassword}</span> : null}
                </label>
              </div>

              <div className="mt-5 rounded-dt border border-dt-border bg-dt-panel2 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-[10px] font-medium text-[#d4dced]"><ShieldCheck size={14} className="text-dt-yellow" /> Tiêu chuẩn bảo mật tài khoản</p>
                  <span className="text-[9px] text-[#63d2b3]">Bảo mật cao</span>
                </div>
                <div className="mt-3 grid gap-2 text-[9px] text-[#63d2b3] sm:grid-cols-3">
                  <span className="flex items-center gap-1.5"><CheckCircle2 size={11} /> Tối thiểu 8 ký tự</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 size={11} /> Chữ hoa & thường</span>
                  <span className="flex items-center gap-1.5 text-[#b7c1d3]"><CheckCircle2 size={11} /> Có ít nhất 1 chữ số</span>
                </div>
              </div>

              <label className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-[#8492a9]">
                <input type="checkbox" checked={values.terms} onChange={(event) => updateValue("terms", event.target.checked)} className="mt-0.5 accent-[var(--dt-yellow)]" />
                <span>Tôi đã đọc và đồng ý với <a href="#terms" className="text-dt-yellow hover:underline">Điều khoản dịch vụ</a> và <a href="#privacy" className="text-dt-yellow hover:underline">Chính sách bảo mật</a> của DeliverTrust.</span>
              </label>
              {errors.terms ? <p className="mt-1 text-[10px] text-[#ff8e91]">{errors.terms}</p> : null}
              {apiError ? <p role="alert" className="mt-4 rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[10px] text-[#ff9a9c]">{apiError}</p> : null}

              <Button type="submit" disabled={submitting} className="mt-5 h-11 w-full rounded-dt bg-dt-yellow text-[12px] font-semibold text-dt-bg hover:brightness-110">
                {submitting ? "Đang tạo tài khoản..." : <>Đăng ký tài khoản <ArrowRight size={15} /></>}
              </Button>
              <p className="mt-4 text-center text-[10px] text-[#8492a9]">Đã có tài khoản? <Link href="/login" className="font-semibold text-dt-yellow hover:underline">Đăng nhập ngay <ArrowRight className="inline" size={11} /></Link></p>
              <p className="mt-5 flex items-center justify-center gap-1.5 text-[9px] text-[#75839a]"><LockKeyhole size={11} className="text-[#63d2b3]" /> Dữ liệu được mã hóa và bảo vệ theo tiêu chuẩn nền tảng</p>
            </form>
          )}
        </section>
      </section>

      <footer className="relative border-t border-dt-border px-4 py-4 text-[9px] text-dt-muted sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 DeliverTrust · Giao nhận minh bạch và có thể xác minh</span>
          <span>Chính sách bảo mật · Hỗ trợ kỹ thuật · Mainnet v2.4</span>
        </div>
      </footer>
    </main>
  );
}
