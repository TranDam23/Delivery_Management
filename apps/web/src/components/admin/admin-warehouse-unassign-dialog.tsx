"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminWarehouseUnassignDialogProps {
  open: boolean;
  userName: string;
  warehouseName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function AdminWarehouseUnassignDialog({
  open,
  userName,
  warehouseName,
  busy,
  onCancel,
  onConfirm,
}: AdminWarehouseUnassignDialogProps): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="warehouse-unassign-title" className="w-full max-w-md rounded-dt border border-dt-border bg-dt-panel p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="warehouse-unassign-title" className="text-base font-semibold text-dt-text">Xác nhận bỏ gán kho</h2>
            <p className="mt-2 text-[13px] leading-5 text-dt-muted">
              Bạn có chắc chắn muốn bỏ gán kho “{warehouseName}” khỏi tài khoản “{userName}” không?
            </p>
          </div>
          <button type="button" aria-label="Đóng hộp thoại" className="text-dt-muted hover:text-dt-text disabled:opacity-50" onClick={onCancel} disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Hủy</Button>
          <Button onClick={onConfirm} disabled={busy}>{busy ? "Đang bỏ gán..." : "Xác nhận bỏ gán"}</Button>
        </div>
      </div>
    </div>
  );
}
