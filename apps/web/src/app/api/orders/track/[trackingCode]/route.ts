import type { NextRequest } from "next/server";
import { OrderStatusCode, RoleCode } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { checkOrderViewAccess } from "@/lib/order-access";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { ok, fail } from "@/lib/api-response";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";
import { estimateDeliveryDate, routeZone } from "@/lib/tracking-estimate";
import { relationValue, statusLabel, type TrackingTimelineEntry } from "@/lib/order-ui";

interface RouteParams {
  params: Promise<{ trackingCode: string }>;
}

/** Public journey stays minimal; staff identities are visible only to authorized dispatch/admin users. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { trackingCode } = await params;
  if (!/^[A-Za-z0-9-]{8,40}$/.test(trackingCode)) return fail("Mã vận đơn không hợp lệ", 400);
  const slot = await takePublicLookupSlot(request);
  if (slot === "limited") return fail("Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau ít phút.", 429);
  if (slot === "unavailable") return fail("Chưa thể tra cứu vận đơn lúc này", 503);

  const supabase = getSupabaseServiceClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, tracking_code, service_type, created_at, created_by, expected_delivery_date, order_statuses(code, name, is_final), pickup_warehouse:warehouses!orders_pickup_warehouse_id_fkey(province, region_code), delivery_warehouse:warehouses!orders_delivery_warehouse_id_fkey(province, region_code)")
    .eq("tracking_code", trackingCode.toUpperCase())
    .maybeSingle();
  if (orderError) return fail("Không thể tra cứu vận đơn lúc này", 500);
  if (!order) return fail("Không tìm thấy đơn hàng", 404);

  const auth = getAuthFromRequest(request);
  const staffRole = auth?.roleCode === RoleCode.ADMIN || auth?.roleCode === RoleCode.DISPATCHER;
  const staffAccess = staffRole && auth ? await checkOrderViewAccess(supabase, auth, order.id) : null;
  const showStaffNames = staffAccess?.allowed === true;

  const [deliveryResult, warehouseResult, blockchainResult] = await Promise.all([
    supabase.from("delivery_events")
      .select("event_time, performed_by, order_statuses!delivery_events_status_id_fkey(code, name)")
      .eq("order_id", order.id).order("event_time", { ascending: true }),
    supabase.from("warehouse_events")
      .select("event_time, event_type, performed_by, warehouse:warehouses!warehouse_events_warehouse_id_fkey(name, province)")
      .eq("order_id", order.id).order("event_time", { ascending: true }),
    supabase.from("blockchain_events")
      .select("event_type, transaction_hash, block_number, tx_status, created_at")
      .eq("order_id", order.id).order("created_at", { ascending: true }),
  ]);
  if (deliveryResult.error || warehouseResult.error || blockchainResult.error) {
    return fail("Không thể tải hành trình đơn hàng lúc này", 500);
  }

  const deliveryEvents = deliveryResult.data ?? [];
  const warehouseEvents = warehouseResult.data ?? [];
  const performerNames = new Map<string, string>();
  if (showStaffNames) {
    const performerIds = [...new Set([...deliveryEvents, ...warehouseEvents].map((event) => event.performed_by).concat(order.created_by).filter((id): id is string => Boolean(id)))];
    if (performerIds.length > 0) {
      const { data: performers, error: performersError } = await supabase.from("users").select("id, full_name").in("id", performerIds);
      if (performersError) return fail("Không thể tải người thực hiện", 500);
      for (const performer of performers ?? []) performerNames.set(performer.id, performer.full_name);
    }
  }

  const timeline: TrackingTimelineEntry[] = [{
    kind: "created", time: order.created_at, label: "Đã tạo đơn", location: null,
    actor: performerNames.get(order.created_by) ?? "Người tạo đơn",
  }];
  for (const event of deliveryEvents) {
    const status = relationValue(event.order_statuses);
    if (status?.code === OrderStatusCode.CREATED) continue;
    timeline.push({
      kind: "status", time: event.event_time, label: statusLabel(event.order_statuses), location: null,
      actor: event.performed_by ? performerNames.get(event.performed_by) ?? "Bộ phận vận hành" : "Hệ thống",
    });
  }
  for (const event of warehouseEvents) {
    const warehouse = relationValue(event.warehouse);
    timeline.push({
      kind: "warehouse", time: event.event_time,
      label: event.event_type === "INBOUND" ? "Nhập kho" : "Xuất kho",
      location: warehouse ? `${warehouse.name} · ${warehouse.province}` : null,
      actor: event.performed_by ? performerNames.get(event.performed_by) ?? "Nhân viên kho" : "Hệ thống",
    });
  }
  timeline.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

  const zone = routeZone(relationValue(order.pickup_warehouse), relationValue(order.delivery_warehouse));
  const estimate = estimateDeliveryDate(order.created_at, order.service_type, order.expected_delivery_date, zone);
  const response = ok({
    order: {
      tracking_code: order.tracking_code,
      service_type: order.service_type,
      created_at: order.created_at,
      expected_delivery_date: estimate.date,
      estimate_source: estimate.source,
      order_statuses: order.order_statuses,
    },
    timeline,
    blockchainEvents: blockchainResult.data ?? [],
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
