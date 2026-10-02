"use client";

import { SelectField } from "@/components/ui/field";
import type { ShippingFeePayer, ShippingPaymentMethod } from "@/lib/shipping-payment";

interface Props {
  payer: ShippingFeePayer;
  method: ShippingPaymentMethod;
  onPayerChange: (value: ShippingFeePayer) => void;
  onMethodChange: (value: ShippingPaymentMethod) => void;
  fee: number;
}

export function ShippingPaymentFields({ payer, method, onPayerChange, onMethodChange, fee }: Props): React.JSX.Element {
  return <div className="space-y-3">
    <p className="text-xs font-semibold">Thanh toán phí vận chuyển</p>
    <SelectField label="Người trả phí" required value={payer} onChange={(event) => onPayerChange(event.target.value as ShippingFeePayer)}>
      <option value="sender">Người gửi trả</option>
      <option value="receiver">Người nhận trả</option>
    </SelectField>
    <SelectField label="Phương thức thanh toán" required value={method} onChange={(event) => onMethodChange(event.target.value as ShippingPaymentMethod)}>
      <option value="cash">Tiền mặt</option>
      <option value="vietqr" disabled>VietQR — chưa cấu hình tài khoản nhận tiền</option>
      <option value="momo" disabled>MoMo — chưa cấu hình tài khoản merchant</option>
    </SelectField>
    <div className="rounded-md border border-dt-yellow/25 bg-dt-yellow/5 p-3 text-xs text-dt-muted">
      <p>Phí vận chuyển dự kiến: <strong className="text-dt-yellow">{fee.toLocaleString("vi-VN")}đ</strong> · {payer === "sender" ? "thu khi lấy hàng" : "thu khi giao hàng"}.</p>
      <p className="mt-1">Tiền COD (nếu có) do người nhận trả riêng khi giao. Chọn phương thức không có nghĩa là đã thanh toán.</p>
    </div>
  </div>;
}
