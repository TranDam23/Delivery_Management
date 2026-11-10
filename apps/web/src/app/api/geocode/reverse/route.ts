import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { geocodeReverse } from "@/lib/geocoder";
import { NominatimError } from "@/lib/nominatim";

/** GET /api/geocode/reverse?lat=...&lon=... — đổi tọa độ thành địa chỉ chữ. */
export async function GET(request: NextRequest) {
  if (!getAuthFromRequest(request)) return fail("Unauthorized", 401);
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
