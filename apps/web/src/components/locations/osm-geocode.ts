/**
 * Đổi tọa độ thành địa chỉ bằng Nominatim (OpenStreetMap), miễn phí và không cần khóa.
 * Chính sách sử dụng: tối đa khoảng 1 lượt gọi mỗi giây, nên các lượt gọi được xếp hàng cách nhau 1,1 giây.
 */
const MIN_INTERVAL_MS = 1100;
let nextAllowedAt = 0;

export interface ReverseGeocodeResult {
  formattedAddress: string;
  placeId: string | null;
}

interface NominatimReverse {
  display_name?: string;
  osm_type?: string;
  osm_id?: number;
}

export interface AddressSearchResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId: string | null;
  /** Chỉ số của chuỗi tìm kiếm khớp (0 = đầy đủ nhất); số lớn nghĩa là chỉ khớp ở cấp tổng quát hơn. */
  levelIndex: number;
}

interface NominatimSearchItem {
  lat?: string;
  lon?: string;
  display_name?: string;
  osm_type?: string;
  osm_id?: number;
}

async function throttle(): Promise<void> {
  const wait = Math.max(0, nextAllowedAt - Date.now());
  nextAllowedAt = Date.now() + wait + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * Tìm tọa độ từ địa chỉ chữ bằng Nominatim (chỉ trong Việt Nam). Thử lần lượt các chuỗi từ chi tiết đến tổng quát
 * (số nhà → phường/xã → quận/huyện → tỉnh) và trả về kết quả đầu tiên tìm được, vì dữ liệu số nhà ở Việt Nam
 * thường chưa đầy đủ trên OpenStreetMap.
 */
export async function searchAddressOsm(queries: string[]): Promise<AddressSearchResult | null> {
  for (let levelIndex = 0; levelIndex < queries.length; levelIndex += 1) {
    const query = queries[levelIndex]?.trim();
    if (!query) continue;
    await throttle();
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const items = (await response.json()) as NominatimSearchItem[];
      const item = items[0];
      const latitude = Number(item?.lat);
      const longitude = Number(item?.lon);
      if (!item || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      return {
        latitude,
        longitude,
        formattedAddress: (item.display_name ?? query).slice(0, 500),
        placeId: item.osm_type && item.osm_id ? `osm:${item.osm_type}/${item.osm_id}` : null,
        levelIndex,
      };
    } catch {
      // Lỗi mạng: thử chuỗi tổng quát hơn rồi thôi.
    }
  }
  return null;
}

export async function reverseGeocodeOsm(latitude: number, longitude: number): Promise<ReverseGeocodeResult | null> {
  const wait = Math.max(0, nextAllowedAt - Date.now());
  nextAllowedAt = Date.now() + wait + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=0&accept-language=vi`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = (await response.json()) as NominatimReverse;
    if (!data.display_name) return null;
    return {
      formattedAddress: data.display_name.slice(0, 500),
      placeId: data.osm_type && data.osm_id ? `osm:${data.osm_type}/${data.osm_id}` : null,
    };
  } catch {
    // Không có địa chỉ chữ cũng không sao: tọa độ ghim vẫn được lưu.
    return null;
  }
}
