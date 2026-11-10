import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { NominatimError, nominatimGet } from "@/lib/nominatim";

interface SearchItem {
  lat?: string;
  lon?: string;
  display_name?: string;
  osm_type?: string;
  osm_id?: number;
}

/** GET /api/geocode/search?q=... — tìm tọa độ từ địa chỉ chữ trong Việt Nam (cần đăng nhập để tránh dùng làm proxy công khai). */
export async function GET(request: NextRequest) {
  if (!getAuthFromRequest(request)) return fail("Unauthorized", 401);
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 300) return fail("Địa chỉ tìm kiếm không hợp lệ", 400);

  try {
    const items = await nominatimGet<SearchItem[]>("search", {
      format: "jsonv2", limit: "1", countrycodes: "vn", "accept-language": "vi", q: query,
    });
    const item = items[0];
    const latitude = Number(item?.lat);
    const longitude = Number(item?.lon);
    if (!item || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return ok({ result: null });
    return ok({
      result: {
        latitude,
        longitude,
        formattedAddress: (item.display_name ?? query).slice(0, 500),
        placeId: item.osm_type && item.osm_id ? `osm:${item.osm_type}/${item.osm_id}` : null,
      },
    });
  } catch (caught) {
    if (caught instanceof NominatimError) return fail(caught.message, caught.status);
    return fail("Không tìm được địa chỉ lúc này", 500);
  }
}
