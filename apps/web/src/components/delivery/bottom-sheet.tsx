"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

/** Bảng trượt từ đáy màn hình, kiểu thao tác quen thuộc trên app điện thoại. */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    // Khóa cuộn cả html lẫn body: trên trình duyệt di động, chỉ khóa body thì
    // trang phía sau vẫn cuộn theo khi vuốt trong bảng.
    const root = document.documentElement;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    document.body.style.overflow = "hidden";
    root.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      root.style.overflow = previousRootOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[90dvh] w-full max-w-[480px] flex-col rounded-t-2xl border border-dt-border bg-dt-panel">
        <div className="flex items-center justify-between gap-3 border-b border-dt-border px-4 py-3">
          <p className="text-[15px] font-semibold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-10 w-10 items-center justify-center rounded-full text-dt-muted hover:bg-dt-panel2">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-dt-border px-4 pt-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
