"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Thanh tren + ngan keo menu cho man hinh nho (< lg), thay cho sidebar co dinh
 * ben trai. Noi dung menu duoc truyen vao de dung chung voi ban desktop.
 */
export function MobileNavDrawer({
  brand,
  children,
}: {
  brand: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="h-[65px] lg:hidden">
      <div className="fixed inset-x-0 top-0 z-40 flex min-h-[65px] items-center justify-between gap-3 border-b border-dt-border bg-dt-side px-4 py-3">
        {brand}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Mở menu"
          aria-expanded={open}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dt-border text-dt-text hover:bg-dt-panel2"
        >
          <Menu size={18} />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu điều hướng">
          <button
            type="button"
            aria-label="Đóng menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col overflow-y-auto border-r border-dt-border bg-dt-side">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Đóng menu"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md text-dt-muted hover:bg-dt-panel2 hover:text-dt-text"
            >
              <X size={18} />
            </button>
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
