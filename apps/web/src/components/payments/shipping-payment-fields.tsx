"use client";

import { SelectField } from "@/components/ui/field";
import type { PaymentMethodAvailability } from "@/lib/payment-accounts";
import type { ShippingFeePayer, ShippingPaymentMethod } from "@/lib/shipping-payment";

interface Props {
  payer: ShippingFeePayer;
  method: ShippingPaymentMethod;
  onPayerChange: (value: ShippingFeePayer) => void;
  onMethodChange: (value: ShippingPaymentMethod) => void;
  /** Phí dự kiến theo tuyến; null khi chưa chọn đủ địa chỉ gửi và nhận. */
  fee: number | null;
  feeNote?: string | null;
  /** Phương thức QR đang có tài khoản nhận tiền; bỏ trống = chỉ tiền mặt (khách vãng lai). */
  availability?: PaymentMethodAvailability;
}

export function ShippingPaymentFields({ payer, method, onPayerChange, onMethodChange, fee, feeNote, availability }: Props): React.JSX.Element {
  return <div className="space-y-3">
    <p className="text-xs font-semibold">Thanh toán phí vận chuyển</p>
    <SelectField label="Người trả phí" required value={payer} onChange={(event) => onPayerChange(event.target.value as ShippingFeePayer)}>
      <option value="sender">Người gửi trả</option>
      <option value="receiver">Người nhận trả</option>
    </SelectField>
    <SelectField label="Phương thức thanh toán" required value={method} onChange={(event) => onMethodChange(event.target.value as ShippingPaymentMethod)}>
      <option value="cash">Tiền mặt</option>
      <option value="vietqr" disabled={!availability?.vietqr}>VietQR{availability?.vietqr ? " — chuyển khoản ngân hàng" : " — chưa cấu hình tài khoản nhận tiền"}</option>
      <option value="momo" disabled={!availability?.momo}>MoMo{availability?.momo ? " — ví MoMo" : " — chưa cấu hình ví nhận tiền"}</option>
    </SelectField>
    <div className="rounded-md border border-dt-yellow/25 bg-dt-yellow/5 p-3 text-xs text-dt-muted">
      <p>Phí vận chuyển dự kiến: {fee === null ? <strong className="text-dt-yellow">{feeNote ? "không áp dụng cho tuyến này" : "chọn địa chỉ gửi và nhận để tính"}</strong> : <strong className="text-dt-yellow">{fee.toLocaleString("vi-VN")}đ</strong>} · {payer === "sender" ? "thu khi lấy hàng" : "thu khi giao hàng"}.</p>
      <p className="mt-1">Tiền COD (nếu có) do người nhận trả riêng khi giao. Chọn phương thức không có nghĩa là đã thanh toán{method === "cash" ? "" : " — sau khi tạo đơn, quét mã QR ở trang chi tiết đơn để chuyển khoản"}.</p>
      {feeNote ? <p className="mt-1 text-dt-red">{feeNote}</p> : null}
    </div>
  </div>;
}
