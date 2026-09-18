import type { NextRequest } from "next/server";
import { RoleCode, ShipmentLegStatusCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** GET /api/shipment-routes/my-legs — các chặng được phân cho nhân viên giao nhận hiện tại. */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.DELIVERY_STAFF) return fail("Forbidden", 403);

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("shipment_legs")
    .select(`
      id, order_id, sequence_no, leg_type, from_warehouse_id, to_warehouse_id,
      assigned_staff_id, assigned_at, responsibility_province, status, attempt_no, is_return,
      started_at, completed_at, note, updated_at,
      orders(
        id, tracking_code, service_type, cod_amount, note,
        pickup_address:addresses!orders_pickup_address_id_fkey(recipient_name, phone, address_line, ward, district, province),
        delivery_address:addresses!orders_delivery_address_id_fkey(recipient_name, phone, address_line, ward, district, province)
      ),
      from_warehouse:warehouses!shipment_legs_from_warehouse_id_fkey(id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code),
      to_warehouse:warehouses!shipment_legs_to_warehouse_id_fkey(id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code),
      deliveries!deliveries_shipment_leg_id_fkey(
        id, delivery_staff_id, received_at,
        delivery_events(event_time, status_id, order_statuses!delivery_events_status_id_fkey(code))
      )
    `)
    .eq("assigned_staff_id", auth.userId)
    .neq("status", ShipmentLegStatusCode.CANCELLED)
    .order("sequence_no", { ascending: true });
  if (error) return fail(error.message, 500);
  return ok(data ?? []);
}
