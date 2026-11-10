import { apiFetch } from "@/lib/api-client";

/**
 * Tìm địa chỉ và đổi tọa độ thành địa chỉ qua máy chủ của ứng dụng (/api/geocode/*), máy chủ mới gọi Nominatim
 * (OpenStreetMap, miễn phí, không cần khóa). Nhờ vậy trình duyệt không bị chặn và giữ được giới hạn 1 lượt/giây.
 */
export interface ReverseGeocodeResult {
  formattedAddress: string;
  placeId: string | null;
}

export interface AddressSearchResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId: string | null;
  /** Chỉ số của chuỗi tìm kiếm khớp (0 = đầy đủ nhất); số lớn nghĩa là chỉ khớp ở cấp tổng quát hơn. */
  levelIndex: number;
}

export interface AddressSearchOutcome {
  result: AddressSearchResult | null;
  /** Lý do lỗi kết nối/dịch vụ (khác với "tìm không thấy"); null khi dịch vụ trả lời bình thường. */
  error: string | null;
}

/**
 * Thử lần lượt các chuỗi từ chi tiết đến tổng quát (số nhà → phường/xã → quận/huyện → tỉnh) và trả về kết quả
 * đầu tiên, vì dữ liệu số nhà ở Việt Nam thường chưa đầy đủ trên OpenStreetMap.
 */
export async function searchAddressOsm(queries: Array<{ query: string; coarse: boolean }>, province?: string): Promise<AddressSearchOutcome> {
  let lastError: string | null = null;
  for (let levelIndex = 0; levelIndex < queries.length; levelIndex += 1) {
    const query = queries[levelIndex]?.query.trim();
    if (!query) continue;
    try {
      const params = new URLSearchParams({ q: query });
      if (province) params.set("province", province);
      if (queries[levelIndex]?.coarse) params.set("coarse", "1");
      const data = await apiFetch<{ result: Omit<AddressSearchResult, "levelIndex"> | null }>(`/api/geocode/search?${params.toString()}`);
      lastError = null;
      if (data.result) return { result: { ...data.result, levelIndex }, error: null };
    } catch (caught) {
      lastError = caught instanceof Error ? caught.message : "Không kết nối được dịch vụ bản đồ";
      // Dịch vụ lỗi thì các chuỗi tổng quát hơn cũng sẽ lỗi: dừng sớm để không chờ thêm.
      break;
    }
  }
  return { result: null, error: lastError };
}

export async function reverseGeocodeOsm(latitude: number, longitude: number): Promise<ReverseGeocodeResult | null> {
  try {
    const data = await apiFetch<{ result: ReverseGeocodeResult | null }>(`/api/geocode/reverse?lat=${latitude}&lon=${longitude}`);
    return data.result;
  } catch {
    // Không có địa chỉ chữ cũng không sao: tọa độ ghim vẫn được lưu.
    return null;
  }
}
