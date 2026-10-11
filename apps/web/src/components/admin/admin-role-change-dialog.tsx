"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminRoleChangeDialogProps {
  userName: string;
  roleName: string;
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function AdminRoleChangeDialog({
  userName,
  roleName,
  open,
  busy,
  onCancel,
  onConfirm,
}: AdminRoleChangeDialogProps): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="role-change-title" className="w-full max-w-md rounded-dt border border-dt-border bg-dt-panel p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="role-change-title" className="text-base font-semibold text-dt-text">Xác nhận thay đổi vai trò</h2>
            <p className="mt-2 text-[13px] leading-5 text-dt-muted">
              Bạn có chắc chắn muốn đổi vai trò của tài khoản “{userName}” thành “{roleName}” không?
            </p>
          </div>
          <button type="button" aria-label="Đóng hộp thoại" className="text-dt-muted hover:text-dt-text" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Hủy</Button>
          <Button onClick={onConfirm} disabled={busy}>{busy ? "Đang lưu..." : "Xác nhận thay đổi"}</Button>
        </div>
      </div>
    </div>
  );
}
