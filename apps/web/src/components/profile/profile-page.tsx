"use client";

import {
  BadgeCheck,
  Bell,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  Mail,
  Package,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  changePasswordSchema,
  OrderStatusCode,
  RoleCode,
  VIETNAM_PROVINCES,
  type AuthenticatedUser,
  type Paginated,
  updateProfileSchema,
} from "@delivery/shared";
import { LogoutButton } from "@/components/auth/logout-button";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { ApiError, apiFetch, updateStoredUser } from "@/lib/api-client";
import { ROLE_LABEL } from "@/lib/role-routing";
import { statusCode, type OrderListItem } from "@/lib/order-ui";

interface ProfileResponse {
  user: AuthenticatedUser;
}

interface ProfileFormState {
  full_name: string;
  email: string;
  phone: string;
  province: string;
}

interface PasswordFormState {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

interface ProfileStats {
  total: number;
  completed: number;
}

const INITIAL_PROFILE: ProfileFormState = {
  full_name: "",
  email: "",
  phone: "",
  province: "",
};

const INITIAL_PASSWORD: PasswordFormState = {
  current_password: "",
  new_password: "",
  confirm_password: "",
};

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(-2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase() || "KH";
}

function profileFormFromUser(user: AuthenticatedUser): ProfileFormState {
  return {
    full_name: user.full_name,
    email: user.email,
    phone: user.phone ?? "",
    province: user.province ?? "",
  };
}

function firstValidationMessage(fieldErrors: Record<string, string[] | undefined>, fallback: string): string {
  return Object.values(fieldErrors).flat().find(Boolean) ?? fallback;
}

interface ProfilePageProps {
  homeHref?: string;
  homeLabel?: string;
}

export function ProfilePage({
  homeHref = "/customer",
  homeLabel = "Về tổng quan",
}: ProfilePageProps = {}): React.JSX.Element {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [form, setForm] = useState<ProfileFormState>(INITIAL_PROFILE);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(INITIAL_PASSWORD);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadProfile(): Promise<void> {
      try {
        const [profileResult, ordersPage] = await Promise.all([
          apiFetch<ProfileResponse>("/api/auth/me"),
          apiFetch<Paginated<OrderListItem>>("/api/orders?pageSize=100").catch(() => null),
        ]);

        if (!mounted) return;
        setUser(profileResult.user);
        setForm(profileFormFromUser(profileResult.user));
        setStats(
          ordersPage
            ? {
                total: ordersPage.total,
                completed: ordersPage.items.filter(
                  (order) => statusCode(order.order_statuses) === OrderStatusCode.DELIVERED,
                ).length,
              }
            : null,
        );
      } catch (caught) {
        if (!mounted) return;
        setProfileError(
          caught instanceof ApiError && caught.status === 401
            ? "Phiên đăng nhập đã hết hạn."
            : caught instanceof Error
              ? caught.message
              : "Không tải được hồ sơ tài khoản",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  function updateProfileField(field: keyof ProfileFormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
    setProfileError(null);
    setProfileMessage(null);
  }

  function updatePasswordField(field: keyof PasswordFormState, value: string): void {
    setPasswordForm((current) => ({ ...current, [field]: value }));
    setPasswordError(null);
    setPasswordMessage(null);
  }

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Tinh phu trach la pham vi quyen do admin cap, khong nam trong form tu
    // cap nhat ca nhan cua dieu phoi vien.
    const profilePayload = { full_name: form.full_name, email: form.email, phone: form.phone };
    const parsed = updateProfileSchema.safeParse(profilePayload);
    if (!parsed.success) {
      setProfileError(firstValidationMessage(parsed.error.flatten().fieldErrors, "Thông tin hồ sơ chưa hợp lệ"));
      return;
    }

    setSavingProfile(true);
    setProfileError(null);
    setProfileMessage(null);
    try {
      const result = await apiFetch<ProfileResponse>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify(parsed.data),
      });
      setUser(result.user);
      setForm(profileFormFromUser(result.user));
      updateStoredUser(result.user);
      setProfileMessage("Thông tin cá nhân đã được cập nhật.");
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : "Không lưu được thông tin hồ sơ");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = changePasswordSchema.safeParse(passwordForm);
    if (!parsed.success) {
      setPasswordError(firstValidationMessage(parsed.error.flatten().fieldErrors, "Thông tin mật khẩu chưa hợp lệ"));
      return;
    }

    setSavingPassword(true);
    setPasswordError(null);
    setPasswordMessage(null);
    try {
      await apiFetch<{ message: string }>("/api/auth/password", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setPasswordForm(INITIAL_PASSWORD);
      setPasswordMessage("Đổi mật khẩu thành công.");
    } catch (caught) {
      setPasswordError(caught instanceof Error ? caught.message : "Không đổi được mật khẩu");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <PageHeader
        heading="Hồ sơ"
        subtitle="Thông tin tài khoản và tùy chọn nhận thông báo."
        action={
          <Link href={homeHref} className={buttonClassName("secondary")}>
            {homeLabel}
          </Link>
        }
      />

      {loading ? (
        <Card>
          <p className="text-[13px] text-dt-muted">Đang tải hồ sơ tài khoản...</p>
        </Card>
      ) : null}

      {!loading && !user ? (
        <Card>
          <p role="alert" className="text-[13px] text-dt-red">
            {profileError ?? "Không có dữ liệu hồ sơ."}
          </p>
        </Card>
      ) : null}

      {!loading && user ? (
        <div className="flex max-w-[1100px] flex-col gap-4">
          <Card className="overflow-hidden border-dt-yellow/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[14px] border border-dt-yellow bg-dt-panel2 text-[23px] font-bold text-dt-yellow">
                  {initials(user.full_name)}
                </div>
                <div>
                  <p className="text-[19px] font-semibold">{user.full_name}</p>
                  <p className="mt-1 text-[11px] text-dt-muted">{ROLE_LABEL[user.roleCode]}</p>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-dt-green/10 px-2.5 py-1 text-[10px] text-dt-green">
                    <BadgeCheck size={12} /> Tài khoản đang hoạt động
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-dt bg-dt-panel2 px-3 py-2 text-[11px] text-dt-muted">
                <ShieldCheck size={15} className="text-dt-yellow" />
                Thông tin được bảo vệ theo phiên đăng nhập
              </div>
            </div>

            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <ProfileMetric
                label="Tổng đơn"
                value={stats ? String(stats.total).padStart(2, "0") : "—"}
                detail="Các đơn thuộc tài khoản"
                icon={<Package size={17} className="text-dt-yellow" />}
              />
              <ProfileMetric
                label="Đã hoàn thành"
                value={stats ? String(stats.completed).padStart(2, "0") : "—"}
                detail="Giao thành công"
                icon={<CheckCircle2 size={17} className="text-dt-green" />}
              />
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="gap-4">
              <div>
                <CardLabel>Thông tin cá nhân</CardLabel>
                <p className="mt-2 text-[12px] text-dt-muted">
                  Cập nhật thông tin dùng cho liên hệ và giao nhận hàng.
                </p>
              </div>

              <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    label="Họ và tên"
                    required
                    autoComplete="name"
                    value={form.full_name}
                    onChange={(event) => updateProfileField("full_name", event.target.value)}
                  />
                  <TextField
                    label="Số điện thoại"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(event) => updateProfileField("phone", event.target.value)}
                    hint="Không bắt buộc; nhập 10 chữ số bắt đầu bằng 0"
                  />
                </div>
                <TextField
                  label="Email đăng nhập"
                  required
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => updateProfileField("email", event.target.value)}
                  hint="Email là định danh đăng nhập và phải duy nhất."
                />
                {user.roleCode === RoleCode.DISPATCHER ? (
                  <SelectField
                    label="Tỉnh/thành phố phụ trách (do Admin cấp)"
                    value={form.province}
                    disabled
                    hint="Phạm vi này do quản trị viên cấu hình để bảo vệ dữ liệu và quyền truy cập theo khu vực."
                  >
                    <option value="" className="bg-dt-panel2">Chọn tỉnh/thành phố</option>
                    {VIETNAM_PROVINCES.map((province) => (
                      <option key={province} value={province} className="bg-dt-panel2">{province}</option>
                    ))}
                  </SelectField>
                ) : null}

                <div className={`grid gap-3 rounded-dt bg-dt-panel2 p-3 ${user.roleCode === RoleCode.DISPATCHER || user.roleCode === RoleCode.WAREHOUSE_STAFF ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                  <ProfileInfo icon={<UserRound size={15} />} label="Vai trò" value={ROLE_LABEL[user.roleCode]} />
                  <ProfileInfo icon={<ShieldCheck size={15} />} label="Quyền hạn" value="Theo vai trò hệ thống" />
                  {user.roleCode === RoleCode.DISPATCHER || user.roleCode === RoleCode.WAREHOUSE_STAFF ? (
                    <ProfileInfo
                      icon={<Package size={15} />}
                      label="Kho phụ trách"
                      value={user.warehouse_id ? "Đã được Admin gán" : "Chưa được gán"}
                    />
                  ) : null}
                </div>
                <p className="text-[11px] text-dt-muted">
                  Vai trò và quyền hạn do hệ thống quản lý, bạn không thể tự thay đổi tại màn hình này.
                </p>

                {profileError ? (
                  <p role="alert" className="rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[12px] text-red-200">
                    {profileError}
                  </p>
                ) : null}
                {profileMessage ? (
                  <p role="status" className="rounded-md border border-dt-green/40 bg-dt-green/10 px-3 py-2 text-[12px] text-green-200">
                    {profileMessage}
                  </p>
                ) : null}

                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={savingProfile}>
                    {savingProfile ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                    {savingProfile ? "Đang lưu..." : "Lưu thay đổi"}
                  </Button>
                </div>
              </form>
            </Card>

            <div className="flex flex-col gap-4">
              <Card className="gap-4">
                <div className="flex items-start gap-3">
                  <span className="rounded-md bg-dt-yellow/10 p-2 text-dt-yellow">
                    <KeyRound size={17} />
                  </span>
                  <div>
                    <CardLabel>Bảo mật</CardLabel>
                    <p className="mt-2 text-[12px] text-dt-muted">Đổi mật khẩu tài khoản của bạn.</p>
                  </div>
                </div>

                <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
                  <TextField
                    label="Mật khẩu hiện tại"
                    required
                    type="password"
                    autoComplete="current-password"
                    value={passwordForm.current_password}
                    onChange={(event) => updatePasswordField("current_password", event.target.value)}
                  />
                  <TextField
                    label="Mật khẩu mới"
                    required
                    type="password"
                    autoComplete="new-password"
                    value={passwordForm.new_password}
                    onChange={(event) => updatePasswordField("new_password", event.target.value)}
                    hint="Ít nhất 6 ký tự"
                  />
                  <TextField
                    label="Xác nhận mật khẩu mới"
                    required
                    type="password"
                    autoComplete="new-password"
                    value={passwordForm.confirm_password}
                    onChange={(event) => updatePasswordField("confirm_password", event.target.value)}
                  />

                  {passwordError ? (
                    <p role="alert" className="rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[12px] text-red-200">
                      {passwordError}
                    </p>
                  ) : null}
                  {passwordMessage ? (
                    <p role="status" className="rounded-md border border-dt-green/40 bg-dt-green/10 px-3 py-2 text-[12px] text-green-200">
                      {passwordMessage}
                    </p>
                  ) : null}

                  <Button type="submit" variant="secondary" disabled={savingPassword}>
                    {savingPassword ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />}
                    {savingPassword ? "Đang cập nhật..." : "Đổi mật khẩu"}
                  </Button>
                </form>
              </Card>

              <Card className="gap-4">
                <CardLabel>Tùy chọn tài khoản</CardLabel>
                <div className="flex items-start gap-3 rounded-md bg-dt-panel2 p-3">
                  <Bell size={16} className="mt-0.5 shrink-0 text-dt-yellow" />
                  <div className="min-w-0">
                    <p className="text-[12px]">Thông báo</p>
                    <p className="mt-1 text-[10px] leading-4 text-dt-muted">
                      Theo dõi thông báo cập nhật trạng thái đơn hàng trong menu Thông báo.
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-full bg-dt-yellow/10 px-2 py-1 text-[9px] text-dt-yellow">
                    Sắp có
                  </span>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-dt-panel2 p-3">
                  <Mail size={16} className="mt-0.5 shrink-0 text-dt-muted" />
                  <div>
                    <p className="text-[12px]">Email liên hệ</p>
                    <p className="mt-1 break-all text-[10px] text-dt-muted">{user.email}</p>
                  </div>
                </div>
                <div className="border-t border-dt-border pt-2">
                  <LogoutButton />
                </div>
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ProfileMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="rounded-dt bg-dt-panel2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-dt-muted">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-[22px] font-semibold">{value}</p>
      <p className="mt-1 text-[10px] text-dt-muted">{detail}</p>
    </div>
  );
}

function ProfileInfo({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-dt-yellow">{icon}</span>
      <div>
        <p className="text-[10px] text-dt-muted">{label}</p>
        <p className="mt-1 text-[11px]">{value}</p>
      </div>
    </div>
  );
}
