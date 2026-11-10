"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Hộp thoại giữa màn hình: nền mờ, cuộn nội dung bên trong, đóng bằng Esc hoặc bấm ra ngoài, khóa cuộn trang phía sau. */
export function Modal({ title, description, onClose, children, footer }: ModalProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex max-h-[94vh] w-full max-w-[860px] flex-col overflow-hidden rounded-t-[16px] border border-dt-border bg-dt-panel shadow-2xl outline-none sm:max-h-[90vh] sm:rounded-[16px]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-dt-border px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-[12px] text-dt-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-2 text-dt-muted hover:bg-white/5 hover:text-dt-text"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-dt-border px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}
