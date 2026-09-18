import type { NextRequest } from "next/server";
import { RoleCode, ShipmentLegStatusCode } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getUserWarehouseId } from "@/lib/dispatcher-scope";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const LEG_SELECT = `
  id, order_id, sequence_no, leg_type, from_warehouse_id, to_warehouse_id,
  assigned_staff_id, assigned_by, assigned_at, responsibility_province, status, attempt_no, is_return,
  started_at, completed_at, note, created_at, updated_at,
  orders(
    id, tracking_code, service_type, cod_amount, note,
    order_items(item_name, quantity, weight),
    pickup_address:addresses!orders_pickup_address_id_fkey(recipient_name, phone, address_line, ward, district, province),
    delivery_address:addresses!orders_delivery_address_id_fkey(recipient_name, phone, address_line, ward, district, province)
  ),
  from_warehouse:warehouses!shipment_legs_from_warehouse_id_fkey(
    id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code
  ),
  to_warehouse:warehouses!shipment_legs_to_warehouse_id_fkey(
    id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code
  )`;

/**
 * GET /api/warehouse-operations — các chặng có điểm nhập/xuất tại kho của
 * nhân viên kho hiện tại. Chặng trung chuyển được cố ý đọc từ cả hai phía để
 * cùng một màn hình xử lý được nhập kho và xuất kho.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.WAREHOUSE_STAFF) return fail("Forbidden", 403);

  const warehouseScope = await getUserWarehouseId(auth);
  if (warehouseScope.error) return fail(warehouseScope.error, 500);
  if (!warehouseScope.warehouseId) {
    return fail("Tài khoản nhân viên kho chưa được gán kho phụ trách", 409);
  }

  const supabase = getSupabaseServiceClient();
  const { data: warehouse, error: warehouseError } = await supabase
    .from("warehouses")
    .select("id, code, name, address_line, ward, district, province, capacity, status, warehouse_level, parent_warehouse_id, region_code, created_at, updated_at")
    .eq("id", warehouseScope.warehouseId)
    .maybeSingle();
  if (warehouseError) return fail(warehouseError.message, 500);
  if (!warehouse) return fail("Kho phụ trách không tồn tại", 404);

  const [fromResult, toResult] = await Promise.all([
    supabase
      .from("shipment_legs")
      .select(LEG_SELECT)
      .eq("from_warehouse_id", warehouse.id)
      .neq("status", ShipmentLegStatusCode.CANCELLED)
      .order("sequence_no", { ascending: true }),
    supabase
      .from("shipment_legs")
      .select(LEG_SELECT)
      .eq("to_warehouse_id", warehouse.id)
      .neq("status", ShipmentLegStatusCode.CANCELLED)
      .order("sequence_no", { ascending: true }),
  ]);
  if (fromResult.error) return fail(fromResult.error.message, 500);
  if (toResult.error) return fail(toResult.error.message, 500);

  const legsById = new Map<string, Record<string, unknown>>();
  for (const leg of [...(fromResult.data ?? []), ...(toResult.data ?? [])]) {
    legsById.set(leg.id, leg as unknown as Record<string, unknown>);
  }
  const legs = Array.from(legsById.values()).sort((left, right) => {
    const leftOrder = typeof left.order_id === "string" ? left.order_id : "";
    const rightOrder = typeof right.order_id === "string" ? right.order_id : "";
    return leftOrder.localeCompare(rightOrder)
      || Number(left.sequence_no ?? 0) - Number(right.sequence_no ?? 0);
  });

  const legIds = legs
    .map((leg) => (typeof leg.id === "string" ? leg.id : null))
    .filter(Boolean) as string[];
  const { data: events, error: eventsError } = legIds.length > 0
    ? await supabase
        .from("warehouse_events")
        .select("id, order_id, shipment_leg_id, warehouse_id, event_type, performed_by, event_time, attempt_no, package_condition, actual_weight_kg, note, performer:users!warehouse_events_performed_by_fkey(full_name)")
        .eq("warehouse_id", warehouse.id)
        .in("shipment_leg_id", legIds)
        .order("event_time", { ascending: true })
    : { data: [], error: null };
  if (eventsError) return fail(eventsError.message, 500);

  const eventsByLeg = new Map<string, unknown[]>();
  for (const event of events ?? []) {
    const current = eventsByLeg.get(event.shipment_leg_id) ?? [];
    current.push(event);
    eventsByLeg.set(event.shipment_leg_id, current);
  }

  return ok({
    warehouse,
    legs: legs.map((leg) => ({
      ...leg,
      warehouse_events: eventsByLeg.get(String(leg.id)) ?? [],
    })),
  });
}
