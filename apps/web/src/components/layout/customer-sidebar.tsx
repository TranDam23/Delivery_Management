"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { NotificationUnreadBadge } from "@/components/notifications/unread-badge";

/**
 * Menu khach hang dung chung cho ca luong gui va nhan. Muc nao chua
 * den luot lam thi de dang chu mo, khong phai link — de nguoi cham bai thay
 * duoc pham vi da hoan thanh thay vi bam vao trang 404.
 */
const CUSTOMER_NAV: { label: string; href?: string }[] = [
  { label: "Tổng quan", href: "/customer" },
  { label: "Tạo đơn hàng", href: "/orders/new" },
  { label: "Đơn tôi gửi", href: "/orders/sent" },
  { label: "Đơn tôi nhận", href: "/orders/received" },
  { label: "Sổ địa chỉ", href: "/contacts" },
  { label: "Theo dõi đơn hàng", href: "/orders/track" },
  { label: "COD", href: "/orders/cod" },
  { label: "Thông báo", href: "/notifications" },
  { label: "Hồ sơ", href: "/profile" },
];

export function CustomerSidebar(): React.JSX.Element {
  const pathname = usePathname();

  const content = (
    <>
      <p className="shrink-0 text-[21px] font-bold text-dt-yellow">DeliverTrust</p>
      <p className="shrink-0 text-[10px] text-dt-muted">Khách hàng</p>
      <div className="my-2 h-px shrink-0 bg-dt-border" />

      <nav className="flex flex-col gap-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-y-contain">
        {CUSTOMER_NAV.map((item) => {
          const active = item.href ? pathname.startsWith(item.href) : false;
          const content = (
            <>
              <span className={clsx("text-[15px]", active ? "text-dt-yellow" : "text-dt-muted")}>
                •
              </span>
              <span className={clsx("text-[11px]", active && "font-medium")}>{item.label}</span>
              {item.label === "Thông báo" && <NotificationUnreadBadge />}
            </>
          );

          const className = clsx(
            "flex h-[38px] items-center gap-[10px] rounded-md px-[10px]",
            active ? "bg-dt-panel2 text-dt-text" : "text-dt-muted",
            item.href && !active && "hover:bg-dt-panel2/60",
          );

          return item.href ? (
            <Link key={item.label} href={item.href} className={className}>
              {content}
            </Link>
          ) : (
            <span key={item.label} className={clsx(className, "cursor-default opacity-70")}>
              {content}
            </span>
          );
        })}
      </nav>

      <div className="mt-auto shrink-0 border-t border-dt-border pt-4">
        <LogoutButton />
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col gap-2 bg-dt-side px-[18px] pb-5 pt-7 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start lg:overflow-hidden">
        {content}
      </aside>
      <MobileNavDrawer brand={<p className="text-[18px] font-bold text-dt-yellow">DeliverTrust</p>}>
        <div className="flex min-h-full flex-col gap-2 px-[18px] pb-5 pt-7">{content}</div>
      </MobileNavDrawer>
    </>
  );
}
