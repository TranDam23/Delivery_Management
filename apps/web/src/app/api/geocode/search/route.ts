import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { geocodeSearch } from "@/lib/geocoder";
import { NominatimError } from "@/lib/nominatim";

/** GET /api/geocode/search?q=... — tìm tọa độ từ địa chỉ chữ trong Việt Nam (cần đăng nhập để tránh dùng làm proxy công khai). */
export async function GET(request: NextRequest) {
  if (!getAuthFromRequest(request)) return fail("Unauthorized", 401);
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 300) return fail("Địa chỉ tìm kiếm không hợp lệ", 400);

  try {
    const province = request.nextUrl.searchParams.get("province")?.trim().slice(0, 100) || undefined;
    const coarse = request.nextUrl.searchParams.get("coarse") === "1";
    return ok({ result: await geocodeSearch(query, { province, coarse }) });
  } catch (caught) {
    if (caught instanceof NominatimError) return fail(caught.message, caught.status);
    return fail("Không tìm được địa chỉ lúc này", 500);
  }
}
