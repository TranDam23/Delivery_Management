import { vietQrImageUrl } from "@/lib/banks";

export type PaymentAccountKind = "bank" | "momo";

export interface PaymentAccount {
  id: string;
  kind: PaymentAccountKind;
  bank_bin: string | null;
  bank_code: string | null;
  bank_name: string;
  /** Số tài khoản ngân hàng, hoặc số điện thoại ví MoMo. */
  account_number: string;
  account_name: string;
  qr_image_url: string | null;
  note: string;
  is_active: boolean;
  created_at: string;
}

export const PAYMENT_ACCOUNT_FIELDS =
  "id, kind, bank_bin, bank_code, bank_name, account_number, account_name, qr_image_url, note, is_active, created_at";

/** Bản chụp tài khoản nhận tiền lưu trên đơn hàng lúc tạo đơn. */
export interface ShippingPayee {
  shipping_payee_kind: PaymentAccountKind | null;
  shipping_payee_bank_bin: string | null;
  shipping_payee_bank_name: string | null;
  shipping_payee_account_number: string | null;
  shipping_payee_account_name: string | null;
  shipping_payee_qr_url: string | null;
}

export const SHIPPING_PAYEE_FIELDS =
  "shipping_payee_kind, shipping_payee_bank_bin, shipping_payee_bank_name, shipping_payee_account_number, shipping_payee_account_name, shipping_payee_qr_url, shipping_transferred_at, shipping_paid_at";

/**
 * Ảnh QR để thanh toán: ngân hàng sinh QR VietQR kèm số tiền + nội dung (mã vận đơn);
 * MoMo cá nhân dùng ảnh mã nhận tiền do admin tải lên (người trả tự nhập số tiền).
 */
export function shippingPaymentQrUrl(payee: ShippingPayee, amount: number, reference: string): string | null {
  if (!payee.shipping_payee_account_number) return null;
  if (payee.shipping_payee_kind === "momo") return payee.shipping_payee_qr_url;
  if (!payee.shipping_payee_bank_bin) return null;
  return vietQrImageUrl({
    bin: payee.shipping_payee_bank_bin,
    accountNumber: payee.shipping_payee_account_number,
    accountName: payee.shipping_payee_account_name,
    amount,
    content: reference,
  });
}

/** Phương thức thanh toán nào đang có tài khoản nhận tiền. */
export interface PaymentMethodAvailability {
  vietqr: boolean;
  momo: boolean;
}
