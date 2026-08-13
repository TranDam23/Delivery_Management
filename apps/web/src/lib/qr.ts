import QRCode from "qrcode";

/** Sinh anh QR (data URL PNG) tu ma tracking_code cua don hang. */
export async function generateOrderQrCode(trackingCode: string): Promise<string> {
  return QRCode.toDataURL(trackingCode, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
}
