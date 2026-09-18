import type { NextRequest } from "next/server";
import {
  OrderStatusCode,
  ShipmentLegStatusCode,
  ShipmentLegType,
  type CourierPosition,
  type LocationSource,
  type MapPoint,
  type OrderMapData,
  type OrderMapStop,
  type WarehouseLevelCode,
} from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { COURIER_CLOCK_SKEW_MS, toMapPoint } from "@/lib/geo";
import { checkOrderViewAccess } from "@/lib/order-access";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface MapAddress {
  address_line: string;
  ward: string | null;
  district: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  formatted_address: string | null;
  location_source: LocationSource | null;
}

interface MapWarehouse {
  id: string;
  code: string;
  name: string;
  address_line: string;
  ward: string | null;
  province: string;
  warehouse_level: WarehouseLevelCode;
  latitude: number | null;
  longitude: number | null;
}

interface MapLeg {
  id: string;
  sequence_no: number;
  leg_type: ShipmentLegType;
  status: string;
  is_return: boolean;
  assigned_at: string | null;
  started_at: string | null;
  from_warehouse: MapWarehouse | null;
  to_warehouse: MapWarehouse | null;
}

interface MapOrder {
  id: string;
  tracking_code: string;
  order_statuses: { code: string } | null;
  pickup_address: MapAddress | null;
  delivery_address: MapAddress | null;
}

const WAREHOUSE_SELECT = "id, code, name, address_line, ward, province, warehouse_level, latitude, longitude";
/** Vị trí cũ hơn ngưỡng này coi như mất tín hiệu, không hiển thị shipper. */
const COURIER_STALE_MS = 30 * 60 * 1000;
const TRAIL_LIMIT = 100;

function addressText(address: MapAddress | null): string {
  if (!address) return "Chưa có địa chỉ";
  return address.formatted_address
    || [address.address_line, address.ward, address.district, address.province].filter(Boolean).join(", ");
}

function addressStop(kind: OrderMapStop["kind"], label: string, address: MapAddress | null, reached: boolean): OrderMapStop {
  return {
    kind,
    label,
    address: addressText(address),
    point: toMapPoint(address?.latitude, address?.longitude),
    location_source: address?.location_source ?? null,
    warehouse_id: null,
    warehouse_level: null,
    reached,
  };
}

function warehouseStop(warehouse: MapWarehouse, reached: boolean): OrderMapStop {
  return {
    kind: "WAREHOUSE",
    label: `${warehouse.code} · ${warehouse.name}`,
    address: [warehouse.address_line, warehouse.ward, warehouse.province].filter(Boolean).join(", "),
    point: toMapPoint(warehouse.latitude, warehouse.longitude),
    location_source: null,
    warehouse_id: warehouse.id,
    warehouse_level: warehouse.warehouse_level,
    reached,
  };
}

/** Chặng mà shipper đang di chuyển thực tế (đi lấy hàng hoặc đang giao). */
function activeCourierLeg(legs: MapLeg[]): MapLeg | null {
  return legs.find((leg) =>
    (leg.leg_type === ShipmentLegType.PICKUP
      && (leg.status === ShipmentLegStatusCode.ASSIGNED || leg.status === ShipmentLegStatusCode.IN_PROGRESS))
    || (leg.leg_type === ShipmentLegType.LAST_MILE && leg.status === ShipmentLegStatusCode.IN_PROGRESS),
  ) ?? null;
}

/**
 * GET /api/orders/:id/map — dữ liệu vẽ bản đồ theo dõi đơn.
 *
 * Trả về các điểm dừng theo đúng tuyến kho đã lập (người gửi → các kho →
 * người nhận, hoặc chiều ngược lại khi hoàn hàng), vị trí mới nhất và vệt di
 * chuyển của shipper khi đang lấy/giao hàng. Điểm chưa có tọa độ vẫn được trả
 * về với point = null để giao diện hiển thị dạng danh sách.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { id } = await params;
  const supabase = getSupabaseServiceClient();
  const access = await checkOrderViewAccess(supabase, auth, id);
  if (!access.allowed) return fail(access.error, access.status);

  const addressColumns = "address_line, ward, district, province, latitude, longitude, formatted_address, location_source";
  const [{ data: orderRaw, error: orderError }, { data: legRows, error: legsError }] = await Promise.all([
    supabase
      .from("orders")
      .select(`id, tracking_code, order_statuses(code),
        pickup_address:addresses!orders_pickup_address_id_fkey(${addressColumns}),
        delivery_address:addresses!orders_delivery_address_id_fkey(${addressColumns})`)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("shipment_legs")
      .select(`id, sequence_no, leg_type, status, is_return, assigned_at, started_at,
        from_warehouse:warehouses!shipment_legs_from_warehouse_id_fkey(${WAREHOUSE_SELECT}),
        to_warehouse:warehouses!shipment_legs_to_warehouse_id_fkey(${WAREHOUSE_SELECT})`)
      .eq("order_id", id)
      .order("sequence_no", { ascending: true }),
  ]);
  if (orderError) return fail(orderError.message, 500);
  if (legsError) return fail(legsError.message, 500);
  const order = orderRaw as unknown as MapOrder | null;
  if (!order) return fail("Order not found", 404);

  const statusCode = order.order_statuses?.code ?? "";
  const allLegs = (legRows ?? []) as unknown as MapLeg[];
  const isReturning = allLegs.some((leg) => leg.is_return)
    && (statusCode === OrderStatusCode.RETURNING || statusCode === OrderStatusCode.RETURNED);
  const legs = allLegs.filter((leg) => leg.is_return === isReturning);

  // Điểm đầu: người gửi (chiều giao) hoặc kho phát đang giữ hàng (chiều hoàn).
  const stops: OrderMapStop[] = [];
  const firstLeg = legs[0];
  if (!isReturning) {
    const pickedUp = firstLeg?.leg_type === ShipmentLegType.PICKUP
      && (firstLeg.status === ShipmentLegStatusCode.IN_PROGRESS || firstLeg.status === ShipmentLegStatusCode.COMPLETED);
    stops.push(addressStop("PICKUP_ADDRESS", "Người gửi", order.pickup_address, pickedUp));
  } else if (firstLeg?.from_warehouse) {
    stops.push(warehouseStop(firstLeg.from_warehouse, true));
  }
  for (const leg of legs) {
    if (leg.to_warehouse) stops.push(warehouseStop(leg.to_warehouse, leg.status === ShipmentLegStatusCode.COMPLETED));
  }
  const lastLeg = legs[legs.length - 1];
  const finalDelivered = lastLeg?.leg_type === ShipmentLegType.LAST_MILE && lastLeg.status === ShipmentLegStatusCode.COMPLETED;
  stops.push(isReturning
    ? addressStop("PICKUP_ADDRESS", "Người gửi (hoàn hàng)", order.pickup_address, finalDelivered)
    : addressStop("DELIVERY_ADDRESS", "Người nhận", order.delivery_address, finalDelivered));

  let courier: CourierPosition | null = null;
  let courierTrail: MapPoint[] = [];
  const activeLeg = activeCourierLeg(legs);
  if (activeLeg) {
    // Cùng mốc với API nhận vị trí: từ lúc nhận chặng, trừ độ lệch đồng hồ.
    const legStart = Date.parse(activeLeg.assigned_at ?? activeLeg.started_at ?? "");
    const since = Number.isFinite(legStart) ? new Date(legStart - COURIER_CLOCK_SKEW_MS).toISOString() : null;
    let trailQuery = supabase
      .from("courier_locations")
      .select("latitude, longitude, accuracy_m, heading_deg, recorded_at")
      .eq("shipment_leg_id", activeLeg.id)
      .order("recorded_at", { ascending: false })
      .limit(TRAIL_LIMIT);
    if (since) trailQuery = trailQuery.gte("recorded_at", since);
    const { data: points, error: pointsError } = await trailQuery;
    if (pointsError) return fail(pointsError.message, 500);

    const latest = points?.[0];
    if (latest && Date.now() - Date.parse(latest.recorded_at) <= COURIER_STALE_MS) {
      courier = {
        point: { latitude: latest.latitude, longitude: latest.longitude },
        accuracy_m: latest.accuracy_m,
        heading_deg: latest.heading_deg,
        recorded_at: latest.recorded_at,
        shipment_leg_id: activeLeg.id,
        leg_type: activeLeg.leg_type,
      };
    }
    courierTrail = (points ?? []).reverse().map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  }

  const data: OrderMapData = {
    order_id: order.id,
    tracking_code: order.tracking_code,
    status_code: statusCode,
    is_returning: isReturning,
    stops,
    courier,
    courier_trail: courierTrail,
    missing_coordinates: stops.filter((stop) => !stop.point).length,
  };
  return ok(data);
}
