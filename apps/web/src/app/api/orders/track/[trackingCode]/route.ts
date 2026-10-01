import type { NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { ok, fail } from "@/lib/api-response";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";

interface RouteParams {
  params: Promise<{ trackingCode: string }>;
}

/**
 * GET /api/orders/track/:trackingCode — tra cuu cong khai hanh trinh don
 * hang (khong yeu cau dang nhap) danh cho nguoi gui/nguoi nhan quet QR.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { trackingCode } = await params;
  if (!/^[A-Za-z0-9-]{8,40}$/.test(trackingCode)) return fail("Mã vận đơn không hợp lệ", 400);
  const slot = await takePublicLookupSlot(request);
  if (slot === "limited") return fail("Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau ít phút.", 429);
  if (slot === "unavailable") return fail("Chưa thể tra cứu vận đơn lúc này", 503);
  const normalizedTrackingCode = trackingCode.toUpperCase();
  const supabase = getSupabaseServiceClient();

  const { data: orderRaw, error } = await supabase
    .from("orders")
    .select("id, tracking_code, service_type, created_at, order_statuses(code, name, is_final)")
    .eq("tracking_code", normalizedTrackingCode)
    .maybeSingle();
  const order = orderRaw as
    | {
        id: string;
        tracking_code: string;
        service_type: string;
        created_at: string;
        order_statuses: { code: string; name: string; is_final: boolean } | null;
      }
    | null;

  if (error) return fail(error.message, 500);
  if (!order) return fail("Khong tim thay don hang", 404);

  const { data: events, error: eventsError } = await supabase
    .from("delivery_events")
    .select("event_time, order_statuses!delivery_events_status_id_fkey(code, name)")
    .eq("order_id", order.id)
    .order("event_time", { ascending: true });
  if (eventsError) return fail("Không tải được hành trình đơn hàng", 500);

  const { data: blockchainEvents, error: blockchainEventsError } = await supabase
    .from("blockchain_events")
    .select("event_type, transaction_hash, block_number, tx_status, created_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  if (blockchainEventsError) return fail("Không tải được sự kiện Blockchain", 500);

  const { data: warehouseEvents, error: warehouseEventsError } = await supabase
    .from("warehouse_events")
    .select(`
      event_time, event_type,
      warehouse:warehouses!warehouse_events_warehouse_id_fkey(code, name, province),
      leg:shipment_legs!warehouse_events_shipment_leg_id_fkey(sequence_no, leg_type)
    `)
    .eq("order_id", order.id)
    .order("event_time", { ascending: true });
  if (warehouseEventsError) return fail(warehouseEventsError.message, 500);

  const response = ok({
    order: {
      tracking_code: order.tracking_code,
      service_type: order.service_type,
      created_at: order.created_at,
      order_statuses: order.order_statuses,
    },
    events: events ?? [],
    warehouseEvents: warehouseEvents ?? [],
    blockchainEvents: blockchainEvents ?? [],
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
