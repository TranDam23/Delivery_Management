"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { RoleCode } from "@delivery/shared";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, formatVnd, type OrderDetail } from "@/lib/order-ui";
import { shippingPaymentQrUrl } from "@/lib/payment-accounts";
import { isQrPaymentMethod } from "@/lib/shipping-payment";

interface Props {
  order: OrderDetail;
  viewerRole: string | null;
  isCustomerParticipant: boolean;
  onChanged: () => void;
}

function CopyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return <div className="flex flex-wrap items-center gap-2">
    <span className="text-dt-muted">{label}:</span>
    <span className={strong ? "font-semibold text-dt-yellow" : "font-medium"}>{value}</span>
    <button type="button" aria-label={`Sao chép ${label}`} className="text-dt-muted hover:text-dt-text" onClick={() => {
      void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
  </div>;
}

/** Quét QR thanh toán phí vận chuyển (VietQR/MoMo) và xác nhận đã nhận tiền. */
export function ShippingPaymentPanel({ order, viewerRole, isCustomerParticipant, onChanged }: Props): React.JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const method = order.shipping_payment_method;
  if (!method || order.shipping_payment_status === "paid") {
    return order.shipping_paid_at ? <p className="text-dt-muted">Đã nhận phí lúc {formatDateTime(order.shipping_paid_at)}.</p> : null;
  }

  const isQr = isQrPaymentMethod(method);
  const isMomo = order.shipping_payee_kind === "momo";
  const reference = order.tracking_code;
  const amount = Number(order.total_fee) || 0;
  const qrUrl = isQr ? shippingPaymentQrUrl({
    shipping_payee_kind: order.shipping_payee_kind ?? null,
    shipping_payee_bank_bin: order.shipping_payee_bank_bin ?? null,
    shipping_payee_bank_name: order.shipping_payee_bank_name ?? null,
    shipping_payee_account_number: order.shipping_payee_account_number ?? null,
    shipping_payee_account_name: order.shipping_payee_account_name ?? null,
    shipping_payee_qr_url: order.shipping_payee_qr_url ?? null,
  }, amount, reference) : null;

  const canReportTransfer = isQr && viewerRole === RoleCode.CUSTOMER && isCustomerParticipant && !order.shipping_transferred_at;
  const canConfirm = viewerRole === RoleCode.ADMIN || viewerRole === RoleCode.DISPATCHER
    || (viewerRole === RoleCode.DELIVERY_STAFF && !isQr);

  async function send(action: "transferred" | "confirm"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/orders/${encodeURIComponent(order.id)}/shipping-payment`, { method: "POST", body: JSON.stringify({ action }) });
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thực hiện được");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-3 rounded-md border border-dt-border bg-dt-panel2 p-3">
    {isQr && order.shipping_payee_account_number ? <>
      <p className="text-center font-medium">{isMomo ? "Quét mã MoMo để thanh toán" : "Quét mã VietQR để thanh toán"}</p>
      {qrUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrUrl} alt={`Mã QR thanh toán ${formatVnd(amount)} cho đơn ${reference}`} width={240} height={240} className="mx-auto block h-60 w-60 rounded-md bg-white object-contain p-2" />
      ) : null}
      {isMomo ? <ol className="mx-auto max-w-xs list-decimal space-y-1 pl-5 text-dt-muted">
        <li>Mở app MoMo → Quét mã.</li>
        <li>Nhập số tiền <b className="text-dt-text">{formatVnd(amount)}</b>.</li>
        <li>Ghi lời nhắn là mã vận đơn <b className="text-dt-yellow">{reference}</b>.</li>
      </ol> : <p className="text-center text-dt-muted">Mở app ngân hàng hoặc MoMo → Quét QR. Số tiền và nội dung đã điền sẵn.</p>}
      <div className="space-y-1.5">
        <p><span className="text-dt-muted">{isMomo ? "Ví" : "Ngân hàng"}:</span> <span className="font-medium">{order.shipping_payee_bank_name}</span></p>
        <CopyRow label={isMomo ? "Số điện thoại" : "Số tài khoản"} value={order.shipping_payee_account_number} />
        {order.shipping_payee_account_name ? <p><span className="text-dt-muted">Chủ {isMomo ? "ví" : "tài khoản"}:</span> <span className="font-medium">{order.shipping_payee_account_name}</span></p> : null}
        <CopyRow label="Số tiền" value={String(amount)} strong />
        <CopyRow label={isMomo ? "Lời nhắn" : "Nội dung chuyển khoản"} value={reference} strong />
      </div>
    </> : null}
    {isQr && !order.shipping_payee_account_number ? <p className="text-dt-muted">Đơn này chưa có tài khoản nhận tiền. Vui lòng liên hệ điều phối viên.</p> : null}
    {!isQr ? <p className="text-dt-muted">Thanh toán bằng tiền mặt cho nhân viên giao nhận; chỉ tính là đã thu sau khi nhân viên xác nhận.</p> : null}
    {order.shipping_transferred_at ? <p className="rounded border border-dt-green/30 bg-dt-green/10 p-2 text-dt-green">Đã báo chuyển khoản lúc {formatDateTime(order.shipping_transferred_at)} — chờ nhân viên xác nhận đã nhận tiền.</p> : null}
    {error ? <p className="text-dt-red">{error}</p> : null}
    <div className="flex flex-wrap gap-2">
      {canReportTransfer ? <Button disabled={busy} onClick={() => void send("transferred")}>Tôi đã chuyển khoản</Button> : null}
      {canConfirm ? <Button variant="secondary" disabled={busy} onClick={() => void send("confirm")}>{isQr ? "Xác nhận đã nhận tiền" : "Xác nhận đã thu tiền mặt"}</Button> : null}
    </div>
  </div>;
}
