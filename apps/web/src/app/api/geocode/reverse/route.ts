import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";
import { geocodeReverse } from "@/lib/geocoder";
import { NominatimError } from "@/lib/nominatim";

/** GET /api/geocode/reverse?lat=...&lon=... — đổi tọa độ thành địa chỉ chữ. */
export async function GET(request: NextRequest) {
  // Khách gửi hàng không cần tài khoản cũng dùng được bản đồ, nhưng bị giới hạn theo địa chỉ IP để không bị lạm dụng làm proxy.
  if (!getAuthFromRequest(request)) {
    const slot = await takePublicLookupSlot(request, { scope: "geocode", limit: 60, windowSeconds: 600 });
    if (slot === "unavailable") return fail("Dịch vụ bản đồ tạm thời chưa sẵn sàng", 503);
    if (slot === "limited") return fail("Bạn tìm địa chỉ quá nhiều lần. Vui lòng thử lại sau ít phút.", 429);
  }
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return fail("Tọa độ không hợp lệ", 400);
  }

  try {
    return ok({ result: await geocodeReverse(latitude, longitude) });
  } catch (caught) {
    if (caught instanceof NominatimError) return fail(caught.message, caught.status);
    return fail("Không lấy được địa chỉ lúc này", 500);
  }
}
