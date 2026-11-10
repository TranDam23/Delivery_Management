import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { NominatimError, nominatimGet } from "@/lib/nominatim";

interface ReverseItem {
  display_name?: string;
  osm_type?: string;
  osm_id?: number;
}

/** GET /api/geocode/reverse?lat=...&lon=... — đổi tọa độ thành địa chỉ chữ. */
export async function GET(request: NextRequest) {
  if (!getAuthFromRequest(request)) return fail("Unauthorized", 401);
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return fail("Tọa độ không hợp lệ", 400);
  }

  try {
    // Làm tròn 5 chữ số thập phân (~1 m) để các lần chọn gần nhau dùng chung kết quả đã nhớ.
    const data = await nominatimGet<ReverseItem>("reverse", {
      format: "jsonv2", zoom: "18", addressdetails: "0", "accept-language": "vi",
      lat: latitude.toFixed(5), lon: longitude.toFixed(5),
    });
    if (!data.display_name) return ok({ result: null });
    return ok({
      result: {
        formattedAddress: data.display_name.slice(0, 500),
        placeId: data.osm_type && data.osm_id ? `osm:${data.osm_type}/${data.osm_id}` : null,
      },
    });
  } catch (caught) {
    if (caught instanceof NominatimError) return fail(caught.message, caught.status);
    return fail("Không lấy được địa chỉ lúc này", 500);
  }
}
