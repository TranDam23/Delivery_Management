import type { NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { ok, fail } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ trackingCode: string }>;
}

/**
 * GET /api/orders/track/:trackingCode — tra cuu cong khai hanh trinh don
 * hang (khong yeu cau dang nhap) danh cho nguoi gui/nguoi nhan quet QR.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { trackingCode } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: orderRaw, error } = await supabase
    .from("orders")
    .select("id, tracking_code, service_type, created_at, order_statuses(code, name, is_final)")
    .eq("tracking_code", trackingCode)
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

  const { data: events } = await supabase
    .from("delivery_events")
    .select("event_time, location_lat, location_lng, note, order_statuses(code, name)")
    .eq("order_id", order.id)
    .order("event_time", { ascending: true });

  const { data: blockchainEvents } = await supabase
    .from("blockchain_events")
    .select("event_type, transaction_hash, block_number, created_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  return ok({ order, events: events ?? [], blockchainEvents: blockchainEvents ?? [] });
}
