import type { NextRequest } from "next/server";
import { ShipmentLegType } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { checkOrderViewAccess } from "@/lib/order-access";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/orders/:id — chi tiet don hang + hang hoa + hanh trinh. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const access = await checkOrderViewAccess(supabase, auth, id);
  if (!access.allowed) return fail(access.error, access.status);
  const { canConfirmReceipt } = access;

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `id, tracking_code, qr_code, service_type, cod_amount, total_fee, note, cancel_reason,
       created_at, updated_at,
       order_statuses(code, name, is_final),
       order_items(*),
       pickup_warehouse:warehouses!orders_pickup_warehouse_id_fkey(id, code, name, ward, district, province, warehouse_level),
       delivery_warehouse:warehouses!orders_delivery_warehouse_id_fkey(id, code, name, ward, district, province, warehouse_level),
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
    .select("id, event_time, location_lat, location_lng, note, image_url, order_statuses!delivery_events_status_id_fkey(code, name)")
    .eq("order_id", id)
    .order("event_time", { ascending: true });

  const { data: lastMileLeg, error: lastMileLegError } = await supabase
    .from("shipment_legs")
    .select("id")
    .eq("order_id", id)
    .eq("leg_type", ShipmentLegType.LAST_MILE)
    .eq("is_return", false)
    .order("sequence_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastMileLegError) return fail(lastMileLegError.message, 500);

  let receiverConfirmation: { confirmedAt: string | null } = { confirmedAt: null };
  if (lastMileLeg) {
    const { data: delivery, error: deliveryError } = await supabase
      .from("deliveries")
      .select("received_at")
      .eq("shipment_leg_id", lastMileLeg.id)
      .maybeSingle();
    if (deliveryError) return fail(deliveryError.message, 500);
    receiverConfirmation = { confirmedAt: delivery?.received_at ?? null };
  }

  return ok({ order, events: events ?? [], receiverConfirmation, canConfirmReceipt });
}
