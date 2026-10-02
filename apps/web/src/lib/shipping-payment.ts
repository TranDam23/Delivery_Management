import { z } from "zod";

/** Phí vận chuyển; không bao gồm khoản COD thu hộ tiền hàng. */
export const shippingFeePayerSchema = z.enum(["sender", "receiver"]);
export const shippingPaymentMethodSchema = z.enum(["cash", "vietqr", "momo"]);
export type ShippingFeePayer = z.infer<typeof shippingFeePayerSchema>;
export type ShippingPaymentMethod = z.infer<typeof shippingPaymentMethodSchema>;

export const SHIPPING_FEE_PAYER_LABEL: Record<ShippingFeePayer, string> = {
  sender: "Người gửi trả",
  receiver: "Người nhận trả",
};
export const SHIPPING_PAYMENT_METHOD_LABEL: Record<ShippingPaymentMethod, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  momo: "MoMo",
};

/** Phương thức cần tài khoản nhận tiền do admin cấu hình (tiền mặt thì không). */
export function isQrPaymentMethod(method: ShippingPaymentMethod | null | undefined): method is "vietqr" | "momo" {
  return method === "vietqr" || method === "momo";
}
