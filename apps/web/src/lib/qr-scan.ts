import { apiFetch } from "@/lib/api-client";
import type { TrackingResult } from "@/lib/order-ui";

const QR_TOKEN_PATH = /^\/tra-cuu\/(trk_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i;

/**
 * Đổi nội dung mã QR (hoặc mã gõ tay/quét bằng súng) thành mã vận đơn viết hoa.
 * QR hiện hành là đường dẫn tra cứu chứa mã công khai; QR cũ chỉ chứa mã vận đơn.
 */
export async function resolveTrackingCode(scanned: string): Promise<string> {
  const value = scanned.trim();
  if (!value) throw new Error("Chưa có nội dung mã QR.");
  let token: string | null = null;
  try {
    token = QR_TOKEN_PATH.exec(new URL(value).pathname)?.[1] ?? null;
  } catch {
    // Không phải đường dẫn tuyệt đối: coi là mã vận đơn.
  }
  if (!token) return value.toUpperCase();
  const result = await apiFetch<TrackingResult>(`/api/orders/track/${encodeURIComponent(token)}`);
  return result.order.tracking_code.toUpperCase();
}
