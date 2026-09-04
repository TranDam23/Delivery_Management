"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";

/**
 * Menu khach hang lay nguyen tu CUSTOMER_NAV trong ban thiet ke. Muc nao chua
 * den luot lam thi de dang chu mo, khong phai link — de nguoi cham bai thay
 * duoc pham vi da hoan thanh thay vi bam vao trang 404.
 */
const CUSTOMER_NAV: { label: string; href?: string }[] = [
  { label: "Tổng quan" },
  { label: "Tạo đơn hàng" },
  { label: "Đơn hàng của tôi" },
  { label: "Sổ địa chỉ", href: "/contacts" },
  { label: "Theo dõi đơn hàng" },
  { label: "COD" },
  { label: "Thông báo" },
  { label: "Hồ sơ" },
];

export function CustomerSidebar(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 bg-dt-side px-[18px] pb-5 pt-7">
      <p className="text-[21px] font-bold text-dt-yellow">DeliverTrust</p>
      <p className="text-[10px] text-dt-muted">Khách hàng / Người gửi</p>
      <div className="my-2 h-px bg-dt-border" />

      <nav className="flex flex-col gap-1">
        {CUSTOMER_NAV.map((item) => {
          const active = item.href ? pathname.startsWith(item.href) : false;
          const content = (
            <>
              <span className={clsx("text-[15px]", active ? "text-dt-yellow" : "text-dt-muted")}>
                •
              </span>
              <span className={clsx("text-[11px]", active && "font-medium")}>{item.label}</span>
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

      <div className="mt-auto border-t border-dt-border pt-4">
        <LogoutButton />
      </div>
    </aside>
  );
}
