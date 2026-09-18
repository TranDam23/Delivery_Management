import type { NextRequest } from "next/server";
import {
  courierLocationSchema,
  RoleCode,
  ShipmentLegStatusCode,
  ShipmentLegType,
} from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { COURIER_CLOCK_SKEW_MS } from "@/lib/geo";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Khoảng cách tối thiểu giữa hai lần lưu vị trí của một chặng. */
const MIN_INTERVAL_MS = 5_000;
/** Chấp nhận điểm đo trễ tối đa (mất sóng rồi gửi lại). */
const MAX_BACKFILL_MS = 60 * 60 * 1000;

/** Chặng có shipper đang di chuyển thực tế hay không. */
function isTrackableLeg(legType: string, status: string): boolean {
  if (legType === ShipmentLegType.PICKUP) {
    // Shipper đang đến chỗ người gửi hoặc đang mang hàng về kho.
    return status === ShipmentLegStatusCode.ASSIGNED || status === ShipmentLegStatusCode.IN_PROGRESS;
  }
  return legType === ShipmentLegType.LAST_MILE && status === ShipmentLegStatusCode.IN_PROGRESS;
}

/**
 * POST /api/shipment-routes/legs/:id/locations — shipper gửi vị trí hiện tại.
 *
 * Chỉ nhận khi chặng đang được chính shipper đó thực hiện, để không lưu vị
 * trí nhân viên ngoài ca làm việc. Dữ liệu dùng cho bản đồ theo dõi đơn.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.DELIVERY_STAFF) return fail("Forbidden", 403);

  const { id } = await params;
  const parsed = courierLocationSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const supabase = getSupabaseServiceClient();
  const { data: leg, error: legError } = await supabase
    .from("shipment_legs")
    .select("id, order_id, leg_type, status, assigned_staff_id, assigned_at, started_at")
    .eq("id", id)
    .maybeSingle();
  if (legError) return fail(legError.message, 500);
  if (!leg) return fail("Không tìm thấy chặng vận chuyển", 404);
  if (leg.assigned_staff_id !== auth.userId) return fail("Chặng này không được phân công cho bạn", 403);
  if (!isTrackableLeg(leg.leg_type, leg.status)) {
    return fail("Chỉ gửi vị trí khi đang lấy hàng hoặc đang giao hàng", 409);
  }

  const now = Date.now();
  const measuredAt = parsed.data.recorded_at ? Date.parse(parsed.data.recorded_at) : now;
  if (measuredAt < now - MAX_BACKFILL_MS) return fail("Điểm vị trí quá cũ", 400);
  // Điểm đo trước khi nhận chặng không thuộc chuyến này.
  const legStartedAt = Date.parse(leg.assigned_at ?? leg.started_at ?? "");
  if (Number.isFinite(legStartedAt) && measuredAt < legStartedAt - COURIER_CLOCK_SKEW_MS) {
    return fail("Điểm vị trí được đo trước khi nhận chặng", 400);
  }
  const recordedAt = new Date(Math.min(measuredAt, now + COURIER_CLOCK_SKEW_MS)).toISOString();

  const { data: latest, error: latestError } = await supabase
    .from("courier_locations")
    .select("recorded_at")
    .eq("shipment_leg_id", id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return fail(latestError.message, 500);
  if (latest && Math.abs(Date.parse(recordedAt) - Date.parse(latest.recorded_at)) < MIN_INTERVAL_MS) {
    return ok({ stored: false, reason: "THROTTLED" });
  }

  const { data: location, error } = await supabase
    .from("courier_locations")
    .insert({
      courier_id: auth.userId,
      shipment_leg_id: id,
      order_id: leg.order_id,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracy_m: parsed.data.accuracy_m ?? null,
      heading_deg: parsed.data.heading_deg ?? null,
      speed_mps: parsed.data.speed_mps ?? null,
      recorded_at: recordedAt,
    })
    .select("id, recorded_at")
    .single();
  if (error) return fail(error.message, 500);

  return ok({ stored: true, location }, 201);
}
