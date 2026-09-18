"use client";

import { Home, LogOut, Route, ScanLine, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthenticatedUser } from "@delivery/shared";
import { clearAuth, getStoredUser } from "@/lib/api-client";

export type DeliveryTab = "home" | "routes" | "scan";

const NAV: Array<{ tab: DeliveryTab; label: string; icon: LucideIcon; href: string }> = [
  { tab: "home", label: "Trang chủ", icon: Home, href: "/dashboard/delivery" },
  { tab: "routes", label: "Chặng giao", icon: Route, href: "/dashboard/delivery/routes" },
  { tab: "scan", label: "Quét mã", icon: ScanLine, href: "/dashboard/delivery/routes?scan=1" },
];

function initials(name: string | undefined): string {
  if (!name) return "SP";
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return ((parts[0]?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase() || "SP";
}

/**
 * Khung giao diện điện thoại cho shipper: header gọn, nội dung cuộn, thanh
 * điều hướng cố định ở đáy (chừa vùng an toàn của iPhone). Trên màn hình lớn
 * hiển thị giữa trang với bề rộng điện thoại.
 */
export function DeliveryMobileShell({
  active,
  subtitle,
  action,
  children,
}: {
  active: DeliveryTab;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser<AuthenticatedUser>());
  }, []);

  function logout(): void {
    clearAuth();
    router.replace("/login");
  }

  return (
    <div className="min-h-dvh bg-dt-bg text-dt-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-[#111216] sm:border-x sm:border-dt-border">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-dt-border bg-[#111216]/95 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dt-yellow text-[11px] font-bold text-dt-bg">{initials(user?.full_name)}</span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{user?.full_name ?? "Nhân viên giao nhận"}</p>
              <p className="truncate text-[11px] text-dt-muted">{subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {action}
            <button type="button" onClick={logout} aria-label="Đăng xuất" className="flex h-10 w-10 items-center justify-center rounded-full text-dt-muted hover:bg-dt-panel2 hover:text-dt-text">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 mx-auto grid w-full max-w-[480px] grid-cols-3 border-t border-dt-border bg-[#15161b]/95 px-2 pt-1.5 backdrop-blur sm:border-x"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          aria-label="Điều hướng nhân viên giao nhận"
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.tab === active;
            return (
              <Link
                key={item.tab}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] ${isActive ? "text-dt-yellow" : "text-dt-muted"}`}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
