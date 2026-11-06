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
