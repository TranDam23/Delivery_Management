import type { NextRequest } from "next/server";
import { RoleCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

type OrderAccess = {
  id: string;
  created_by: string;
  sender: { user_id: string | null } | null;
  receiver: { user_id: string | null } | null;
};

function canViewAllOrders(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.DISPATCHER;
}

/** GET /api/orders/:id — chi tiet don hang + hang hoa + hanh trinh. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  // API dung service role nen phai kiem tra quyen truoc khi tra ve chi tiet.
  // Khach hang chi duoc xem don minh tao, don gan voi contact cua minh; nhan
  // vien giao hang chi duoc xem don dang duoc phan cong cho minh.
  const { data: accessRaw, error: accessError } = await supabase
    .from("orders")
    .select(
      "id, created_by, sender:contacts!orders_sender_id_fkey(user_id), receiver:contacts!orders_receiver_id_fkey(user_id)",
    )
    .eq("id", id)
    .maybeSingle();
  const access = accessRaw as OrderAccess | null;

  if (accessError) return fail(accessError.message, 500);
  if (!access) return fail("Order not found", 404);

  const isCustomerParticipant =
    access.created_by === auth.userId ||
    access.sender?.user_id === auth.userId ||
    access.receiver?.user_id === auth.userId;

  let isAssignedDeliveryStaff = false;
  if (auth.roleCode === RoleCode.DELIVERY_STAFF) {
    const { data: delivery, error: deliveryError } = await supabase
      .from("deliveries")
      .select("id")
      .eq("order_id", id)
      .eq("delivery_staff_id", auth.userId)
      .limit(1)
      .maybeSingle();
    if (deliveryError) return fail(deliveryError.message, 500);
    isAssignedDeliveryStaff = Boolean(delivery);
  }

  if (!canViewAllOrders(auth.roleCode) && !isCustomerParticipant && !isAssignedDeliveryStaff) {
    return fail("Forbidden", 403);
  }

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
