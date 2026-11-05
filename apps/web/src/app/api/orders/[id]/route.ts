import type { NextRequest } from "next/server";
import { z } from "zod";
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

  const parsedOrderId = z.string().uuid().safeParse((await params).id);
  if (!parsedOrderId.success) return fail("Mã đơn hàng không hợp lệ.", 400);
  const orderId = parsedOrderId.data.toLowerCase();
  const supabase = getSupabaseServiceClient();

  const access = await checkOrderViewAccess(supabase, auth, orderId);
  if (!access.allowed) {
    if (access.status >= 500) {
      console.error("Checking order detail access failed", { orderId, error: access.error });
      return fail("Không thể kiểm tra quyền truy cập đơn hàng.", 500);
    }
    return fail(access.error, access.status);
  }
  const { canConfirmReceipt } = access;

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      `id, tracking_code, qr_code, service_type, cod_amount, total_fee, shipping_fee_payer, shipping_payment_method, shipping_payment_status, shipping_payee_kind, shipping_payee_bank_bin, shipping_payee_bank_name, shipping_payee_account_number, shipping_payee_account_name, shipping_payee_qr_url, shipping_transferred_at, shipping_paid_at, note, cancel_reason,
       created_at, updated_at,
       order_statuses(code, name, is_final),
       order_items(id, item_name, item_type, quantity, weight, length, width, height, declared_value, note),
       pickup_warehouse:warehouses!orders_pickup_warehouse_id_fkey(id, code, name, ward, district, province, warehouse_level),
       delivery_warehouse:warehouses!orders_delivery_warehouse_id_fkey(id, code, name, ward, district, province, warehouse_level),
       sender:contacts!orders_sender_id_fkey(id, name, phone),
       receiver:contacts!orders_receiver_id_fkey(id, name, phone),
       pickup_address:addresses!orders_pickup_address_id_fkey(id, recipient_name, phone, address_line, ward, district, province),
       delivery_address:addresses!orders_delivery_address_id_fkey(id, recipient_name, phone, address_line, ward, district, province)`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("Loading order detail failed", { orderId, error });
    return fail("Không thể tải chi tiết đơn hàng.", 500);
  }
  if (!order) return fail("Order not found", 404);

  const { data: codTransaction, error: codError } = Number(order.cod_amount) > 0
    ? await supabase.from("cod_transactions").select("status, amount, collected_at, reconciled_at, remitted_at, handed_over_at")
      .eq("order_id", orderId).maybeSingle()
    : { data: null, error: null };
  if (codError) {
    console.error("Loading order COD transaction failed", { orderId, error: codError });
    return fail("Không thể tải thông tin COD.", 500);
  }

  const { data: events, error: eventsError } = await supabase
    .from("delivery_events")
    .select("id, event_time, location_lat, location_lng, note, image_url, order_statuses!delivery_events_status_id_fkey(code, name)")
    .eq("order_id", orderId)
    .order("event_time", { ascending: true })
    .order("id", { ascending: true });
  if (eventsError) {
    console.error("Loading delivery history failed", { orderId, error: eventsError });
    return fail("Không thể tải lịch sử giao nhận.", 500);
  }

  const { data: warehouseEvents, error: warehouseEventsError } = await supabase
    .from("warehouse_events")
    .select("id, event_time, event_type, package_condition, actual_weight_kg, warehouse:warehouses!warehouse_events_warehouse_id_fkey(name, province)")
    .eq("order_id", orderId)
    .order("event_time", { ascending: true })
    .order("id", { ascending: true });
  if (warehouseEventsError) {
    console.error("Loading warehouse history failed", { orderId, error: warehouseEventsError });
    return fail("Không thể tải lịch sử tại kho.", 500);
  }

  const { data: lastMileLeg, error: lastMileLegError } = await supabase
    .from("shipment_legs")
    .select("id")
    .eq("order_id", orderId)
    .eq("leg_type", ShipmentLegType.LAST_MILE)
    .eq("is_return", false)
    .order("sequence_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastMileLegError) {
    console.error("Loading last-mile leg failed", { orderId, error: lastMileLegError });
    return fail("Không thể tải chặng giao cuối.", 500);
  }

  let receiverConfirmation: { confirmedAt: string | null } = { confirmedAt: null };
  if (lastMileLeg) {
    const { data: delivery, error: deliveryError } = await supabase
      .from("deliveries")
      .select("received_at")
      .eq("shipment_leg_id", lastMileLeg.id)
      .maybeSingle();
    if (deliveryError) {
      console.error("Loading receiver confirmation failed", { orderId, error: deliveryError });
      return fail("Không thể tải xác nhận nhận hàng.", 500);
    }
    receiverConfirmation = { confirmedAt: delivery?.received_at ?? null };
  }

  return ok({ order, events: events ?? [], warehouseEvents: warehouseEvents ?? [], receiverConfirmation, canConfirmReceipt, codTransaction, viewerRole: auth.roleCode, isCustomerParticipant: access.isCustomerParticipant });
}
