import QRCode from "qrcode";

/** Generates a QR image (PNG data URL) from an order tracking URL. */
export async function generateOrderQrCode(trackingUrl: string): Promise<string> {
  return QRCode.toDataURL(trackingUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
}
