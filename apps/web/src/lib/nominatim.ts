/**
 * Gọi Nominatim (OpenStreetMap) từ máy chủ thay vì từ trình duyệt: tránh bị trình duyệt/tiện ích chặn,
 * gửi thông tin định danh ứng dụng theo chính sách sử dụng, giữ giới hạn 1 lượt/giây cho cả hệ thống
 * và nhớ tạm kết quả để không gọi lặp.
 */
const BASE_URL = process.env.NOMINATIM_BASE_URL?.trim() || "https://nominatim.openstreetmap.org";
const USER_AGENT = process.env.NOMINATIM_USER_AGENT?.trim() || "DeliverTrust/1.0 (do an tot nghiep quan ly giao nhan)";
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

let nextAllowedAt = 0;
const cache = new Map<string, { at: number; value: unknown }>();

export class NominatimError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "NominatimError";
  }
}

async function throttle(): Promise<void> {
  const wait = Math.max(0, nextAllowedAt - Date.now());
  nextAllowedAt = Date.now() + wait + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/** GET tới Nominatim với tham số cho trước; trả về JSON hoặc ném NominatimError có mô tả lý do. */
export async function nominatimGet<T>(path: "search" | "reverse", params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const cacheKey = url.toString();

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;

  await throttle();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "vi" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (caught) {
    const timedOut = caught instanceof Error && (caught.name === "TimeoutError" || caught.name === "AbortError");
    throw new NominatimError(timedOut ? "Dịch vụ bản đồ phản hồi quá chậm" : "Máy chủ không kết nối được dịch vụ bản đồ Nominatim", 502);
  }
  if (!response.ok) {
    throw new NominatimError(
      response.status === 429 ? "Dịch vụ bản đồ đang giới hạn lượt tìm, hãy thử lại sau ít phút" : `Dịch vụ bản đồ trả lỗi ${response.status}`,
      502,
    );
  }
  const value = (await response.json()) as T;
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
