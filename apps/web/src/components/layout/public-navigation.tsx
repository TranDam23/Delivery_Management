"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navigation = [
  { href: "/", label: "Trang chủ" },
  { href: "/tra-cuu", label: "Tra cứu vận đơn" },
  { href: "/gui-hang", label: "Gửi hàng" },
  { href: "/tra-lai-ma", label: "Tra lại mã" },
  { href: "/#tinh-nang", label: "Tính năng" },
  { href: "/#cach-hoat-dong", label: "Cách hoạt động" },
  { href: "/#minh-bach", label: "Blockchain" },
] as const;

function isPublicPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/login" || pathname === "/gui-hang"
    || pathname === "/tra-lai-ma" || pathname === "/tra-cuu" || pathname.startsWith("/tra-cuu/")
    || pathname === "/terms" || pathname === "/privacy";
}

export function PublicNavigation(): React.JSX.Element | null {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  if (!isPublicPath(pathname)) return null;

  const links = navigation.map(({ href, label }) => {
    const active = href === pathname || (href === "/tra-cuu" && pathname.startsWith("/tra-cuu/"));
    return <Link key={href} href={href} aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded px-2 py-2 transition max-lg:block max-lg:px-3 max-lg:py-3 max-lg:text-[13px] hover:text-dt-text ${active ? "text-dt-yellow" : "text-dt-muted"}`}>
      {label}
    </Link>;
  });

  return <header className="sticky top-0 z-50 border-b border-dt-border/80 bg-dt-bg/95 text-dt-text shadow-sm shadow-black/20 backdrop-blur">
    <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3 px-5 py-3 md:gap-5 md:px-8">
      <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="DeliverTrust - Trang chủ">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-dt-yellow text-sm font-black text-dt-bg">DT</span>
        <span>
          <span className="block text-[15px] font-semibold tracking-tight">DeliverTrust</span>
          <span className="mt-0.5 hidden text-[9px] uppercase tracking-[0.18em] text-dt-muted sm:block">Deliver. Track. Verify.</span>
        </span>
      </Link>
      <nav className="hidden items-center gap-1 text-[11px] lg:flex" aria-label="Menu khách vãng lai">
        {links}
      </nav>
      <div className="flex items-center gap-2">
        <Link href={pathname === "/login" ? "/" : "/login"}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-dt-yellow px-3 py-2.5 text-[11px] font-semibold text-dt-bg transition hover:brightness-110 md:px-4">
          {pathname === "/login" ? "Trang chủ" : "Đăng nhập"} <ArrowRight size={14} strokeWidth={2} />
        </Link>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "Đóng menu" : "Mở menu"} aria-expanded={open}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dt-border text-dt-text hover:bg-dt-panel2 lg:hidden">
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
    </div>
    {open ? <nav className="mx-auto flex max-h-[calc(100dvh-64px)] max-w-[1240px] flex-col overflow-y-auto border-t border-dt-border px-3 py-2 text-[13px] lg:hidden"
      aria-label="Menu khách vãng lai trên màn hình nhỏ">
      {links}
    </nav> : null}
  </header>;
}
