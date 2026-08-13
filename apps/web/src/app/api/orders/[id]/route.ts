import type { NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/orders/:id — chi tiet don hang + hang hoa + hanh trinh. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `id, tracking_code, qr_code, service_type, cod_amount, total_fee, note, cancel_reason,
       created_at, updated_at,
       order_statuses(code, name, is_final),
       order_items(*),
       sender:contacts!orders_sender_id_fkey(id, name, phone),
       receiver:contacts!orders_receiver_id_fkey(id, name, phone),
       pickup_address:addresses!orders_pickup_address_id_fkey(*),
       delivery_address:addresses!orders_delivery_address_id_fkey(*)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!order) return fail("Order not found", 404);

  const { data: events } = await supabase
    .from("delivery_events")
    .select("id, event_time, location_lat, location_lng, note, image_url, order_statuses(code, name)")
    .eq("order_id", id)
    .order("event_time", { ascending: true });

  return ok({ order, events: events ?? [] });
}
