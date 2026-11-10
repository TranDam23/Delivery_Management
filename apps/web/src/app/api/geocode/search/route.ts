import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";
import { geocodeSearch } from "@/lib/geocoder";
import { NominatimError } from "@/lib/nominatim";

/** GET /api/geocode/search?q=... — tìm tọa độ từ địa chỉ chữ trong Việt Nam (cần đăng nhập để tránh dùng làm proxy công khai). */
export async function GET(request: NextRequest) {
  // Khách gửi hàng không cần tài khoản cũng dùng được bản đồ, nhưng bị giới hạn theo địa chỉ IP để không bị lạm dụng làm proxy.
  if (!getAuthFromRequest(request)) {
    const slot = await takePublicLookupSlot(request, { scope: "geocode", limit: 60, windowSeconds: 600 });
    if (slot === "unavailable") return fail("Dịch vụ bản đồ tạm thời chưa sẵn sàng", 503);
    if (slot === "limited") return fail("Bạn tìm địa chỉ quá nhiều lần. Vui lòng thử lại sau ít phút.", 429);
  }
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
