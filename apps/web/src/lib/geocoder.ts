import { NominatimError, nominatimGet } from "@/lib/nominatim";

/**
 * Tìm địa chỉ → tọa độ và tọa độ → địa chỉ bằng các dịch vụ miễn phí dựa trên dữ liệu OpenStreetMap, không cần khóa:
 *   1. Photon (photon.komoot.io): tìm theo từ khóa linh hoạt, thường dùng được cả khi Nominatim bị chặn mạng.
 *   2. Nominatim (nominatim.openstreetmap.org): dự phòng.
 * Thứ tự đổi được bằng biến GEOCODER_PROVIDERS (ví dụ "nominatim,photon").
 */
const PHOTON_URL = process.env.PHOTON_BASE_URL?.trim() || "https://photon.komoot.io";
const USER_AGENT = process.env.NOMINATIM_USER_AGENT?.trim() || "DeliverTrust/1.0 (do an tot nghiep quan ly giao nhan)";
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const VIETNAM_BBOX = "102.1,8.4,109.5,23.4";

type Provider = "photon" | "nominatim";

export interface GeoSearchOptions {
  /** Tỉnh/thành phố người dùng đã chọn: kết quả không thuộc tỉnh này bị loại để tránh ghim sai nơi. */
  province?: string;
  /** Tìm ở cấp phường/xã, quận/huyện hoặc tỉnh (không có số nhà): chỉ lấy đối tượng khu vực, không lấy cửa hàng/tòa nhà. */
  coarse?: boolean;
}

/** Bỏ dấu, chữ thường, bỏ tiền tố hành chính để so khớp tên tỉnh ("Thành phố Hà Nội" ≈ "Hà Nội"). */
function provinceCore(value: string | undefined): string {
  return (value ?? "")
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\b(thanh pho|tinh|tp)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function inProvince(text: string, province: string | undefined): boolean {
  const core = provinceCore(province);
  return !core || provinceCore(text).includes(core);
}

export interface GeoSearchResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId: string | null;
}

export interface GeoReverseResult {
  formattedAddress: string;
  placeId: string | null;
}

const cache = new Map<string, { at: number; value: unknown }>();

function providers(): Provider[] {
  const configured = (process.env.GEOCODER_PROVIDERS ?? "photon,nominatim")
    .split(",").map((item) => item.trim().toLowerCase())
    .filter((item): item is Provider => item === "photon" || item === "nominatim");
  return configured.length > 0 ? configured : ["photon", "nominatim"];
}

async function photonGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${PHOTON_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const cacheKey = url.toString();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (caught) {
    const timedOut = caught instanceof Error && (caught.name === "TimeoutError" || caught.name === "AbortError");
    throw new NominatimError(timedOut ? "Photon phản hồi quá chậm" : "không kết nối được Photon", 502);
  }
  if (!response.ok) throw new NominatimError(response.status === 429 ? "Photon đang giới hạn lượt tìm" : `Photon trả lỗi ${response.status}`, 502);
  const value = (await response.json()) as T;
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    state?: string;
    county?: string;
    country?: string;
  };
}

const OSM_TYPE: Record<string, string> = { N: "node", W: "way", R: "relation" };

function photonAddress(feature: PhotonFeature, fallback: string): string {
  const p = feature.properties ?? {};
  const street = p.street ? [p.housenumber, p.street].filter(Boolean).join(" ") : p.housenumber;
  const parts = [p.name, street, p.locality, p.district, p.city ?? p.state, p.country].filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index);
  return (parts.join(", ") || fallback).slice(0, 500);
}

function photonPlaceId(feature: PhotonFeature): string | null {
  const type = OSM_TYPE[feature.properties?.osm_type ?? ""];
  return type && feature.properties?.osm_id ? `osm:${type}/${feature.properties.osm_id}` : null;
}

/** Trả về { result } khi ít nhất một dịch vụ trả lời; ném lỗi (kèm lý do từng dịch vụ) khi tất cả đều lỗi. */
async function firstAnswer<T>(attempts: Array<{ name: string; run: () => Promise<T | null> }>): Promise<T | null> {
  const failures: string[] = [];
  let answered = false;
  for (const attempt of attempts) {
    try {
      const value = await attempt.run();
      answered = true;
      if (value) return value;
    } catch (caught) {
      failures.push(caught instanceof Error ? caught.message : `${attempt.name} lỗi`);
    }
  }
  if (!answered) throw new NominatimError(`Dịch vụ bản đồ không khả dụng (${failures.join("; ")})`, 502);
  return null;
}

export async function geocodeSearch(query: string, options: GeoSearchOptions = {}): Promise<GeoSearchResult | null> {
  return firstAnswer<GeoSearchResult>(providers().map((provider) => ({
    name: provider,
    run: async (): Promise<GeoSearchResult | null> => {
      if (provider === "photon") {
        const data = await photonGet<{ features?: PhotonFeature[] }>("api/", {
          q: query, limit: "5", bbox: VIETNAM_BBOX, ...(options.coarse ? { osm_tag: "place" } : {}),
        });
        // Lấy kết quả đầu tiên thuộc đúng tỉnh/thành phố đã chọn.
        for (const feature of data.features ?? []) {
          const [longitude, latitude] = feature.geometry?.coordinates ?? [];
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
          const p = feature.properties ?? {};
          if (!inProvince([p.state, p.city, p.county].filter(Boolean).join(" "), options.province)) continue;
          return { latitude: latitude!, longitude: longitude!, formattedAddress: photonAddress(feature, query), placeId: photonPlaceId(feature) };
        }
        return null;
      }
      const items = await nominatimGet<Array<{ lat?: string; lon?: string; display_name?: string; osm_type?: string; osm_id?: number }>>("search", {
        format: "jsonv2", limit: "5", countrycodes: "vn", "accept-language": "vi", q: query,
      });
      const item = items.find((candidate) => inProvince(candidate.display_name ?? "", options.province));
      const latitude = Number(item?.lat);
      const longitude = Number(item?.lon);
      if (!item || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        latitude, longitude,
        formattedAddress: (item.display_name ?? query).slice(0, 500),
        placeId: item.osm_type && item.osm_id ? `osm:${item.osm_type}/${item.osm_id}` : null,
      };
    },
  })));
}

export async function geocodeReverse(latitude: number, longitude: number): Promise<GeoReverseResult | null> {
  return firstAnswer<GeoReverseResult>(providers().map((provider) => ({
    name: provider,
    run: async (): Promise<GeoReverseResult | null> => {
      if (provider === "photon") {
        const data = await photonGet<{ features?: PhotonFeature[] }>("reverse", { lat: latitude.toFixed(5), lon: longitude.toFixed(5), limit: "1" });
        const feature = data.features?.[0];
        if (!feature) return null;
        return { formattedAddress: photonAddress(feature, ""), placeId: photonPlaceId(feature) };
      }
      const data = await nominatimGet<{ display_name?: string; osm_type?: string; osm_id?: number }>("reverse", {
        format: "jsonv2", zoom: "18", addressdetails: "0", "accept-language": "vi", lat: latitude.toFixed(5), lon: longitude.toFixed(5),
      });
      if (!data.display_name) return null;
      return {
        formattedAddress: data.display_name.slice(0, 500),
        placeId: data.osm_type && data.osm_id ? `osm:${data.osm_type}/${data.osm_id}` : null,
      };
    },
  })));
}
