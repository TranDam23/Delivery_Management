import {
  OrderStatusCode,
  ShipmentLegStatusCode,
  ShipmentLegType,
  WarehouseLevelCode,
} from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { matchesProvince, selectNearestWarehouse } from "@/lib/shipment-routing";
import { fetchActiveCommuneWarehouses } from "@/lib/warehouse-queries";

export interface PlannerWarehouse {
  id: string;
  code: string;
  name: string;
  ward: string | null;
  province: string;
  district: string | null;
  status: string;
  warehouse_level: string;
  parent_warehouse_id: string | null;
  region_code: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface PlannerOrder {
  id: string;
  tracking_code: string;
  status_id: string;
  created_at: string;
  pickup_warehouse_id: string | null;
  delivery_warehouse_id: string | null;
  order_statuses: { code: string; name: string } | null;
  pickup_warehouse: PlannerWarehouse | null;
  delivery_warehouse: PlannerWarehouse | null;
  pickup_address: {
    address_line: string;
    ward: string | null;
    district: string | null;
    province: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  delivery_address: {
    address_line: string;
    ward: string | null;
    district: string | null;
    province: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

interface ResolvedWarehousePath {
  pickupChild: PlannerWarehouse;
  pickupParent: PlannerWarehouse;
  pickupRegional: PlannerWarehouse | null;
  deliveryChild: PlannerWarehouse;
  deliveryParent: PlannerWarehouse;
  deliveryRegional: PlannerWarehouse | null;
}

interface PlannedLegRow {
  order_id: string;
  sequence_no: number;
  leg_type: string;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  responsibility_province: string | null;
  status: string;
  is_return?: boolean;
}

export interface AutomaticRouteResult {
  order_id: string;
  legs: unknown[];
  route: {
    pickup_child: PlannerWarehouse;
    pickup_parent: PlannerWarehouse;
    pickup_regional: PlannerWarehouse | null;
    delivery_parent: PlannerWarehouse;
    delivery_child: PlannerWarehouse;
    delivery_regional: PlannerWarehouse | null;
  };
  strategy: "SAME_WAREHOUSE" | "SAME_PROVINCE" | "CROSS_PROVINCE" | "CROSS_REGION";
}

function orderSelect(): string {
  return `id, tracking_code, status_id, created_at, pickup_warehouse_id, delivery_warehouse_id,
    order_statuses(code, name),
    pickup_warehouse:warehouses!orders_pickup_warehouse_id_fkey(id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code),
    delivery_warehouse:warehouses!orders_delivery_warehouse_id_fkey(id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code),
    pickup_address:addresses!orders_pickup_address_id_fkey(address_line, ward, district, province, latitude, longitude),
    delivery_address:addresses!orders_delivery_address_id_fkey(address_line, ward, district, province, latitude, longitude)`;
}

async function resolveWarehousePath(
  order: PlannerOrder,
): Promise<{ path: ResolvedWarehousePath | null; error: string | null }> {
  if (
    !order.pickup_address?.province?.trim()
    || !order.pickup_address.ward?.trim()
  ) {
    return { path: null, error: "Địa chỉ lấy hàng phải có tỉnh/thành phố và xã/phường để lập tuyến" };
  }
  if (
    !order.delivery_address?.province?.trim()
    || !order.delivery_address.ward?.trim()
  ) {
    return { path: null, error: "Địa chỉ giao hàng phải có tỉnh/thành phố và xã/phường để lập tuyến" };
  }

  const supabase = getSupabaseServiceClient();
  const { data: children, error: childError } = await fetchActiveCommuneWarehouses<PlannerWarehouse>(
    "id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code, latitude, longitude",
  );
  if (childError) return { path: null, error: childError };

  const activeChildById = new Map(children.map((warehouse) => [warehouse.id, warehouse]));
  const pickupChild = (order.pickup_warehouse_id
    ? activeChildById.get(order.pickup_warehouse_id)
    : null) ?? selectNearestWarehouse(order.pickup_address, children);
  const deliveryChild = (order.delivery_warehouse_id
    ? activeChildById.get(order.delivery_warehouse_id)
    : null) ?? selectNearestWarehouse(order.delivery_address, children);

  if (!pickupChild) return { path: null, error: "Chưa có kho con hoạt động gần địa chỉ lấy hàng" };
  if (!deliveryChild) return { path: null, error: "Chưa có kho con hoạt động gần địa chỉ giao hàng" };
  const { data: parentRows, error: parentError } = await supabase
    .from("warehouses")
    .select("id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code")
    .eq("warehouse_level", WarehouseLevelCode.PROVINCE)
    .eq("status", "active");
  if (parentError) return { path: null, error: parentError.message };

  const parents = (parentRows ?? []) as PlannerWarehouse[];
  const parentById = new Map(parents.map((warehouse) => [warehouse.id, warehouse]));
  const parentForChild = (child: PlannerWarehouse): PlannerWarehouse | null => {
    const linkedParent = child.parent_warehouse_id ? parentById.get(child.parent_warehouse_id) : null;
    if (linkedParent && matchesProvince(linkedParent.province, child.province)) return linkedParent;
    return parents.find((parent) => matchesProvince(parent.province, child.province)) ?? null;
  };
  const pickupParent = parentForChild(pickupChild);
  const deliveryParent = parentForChild(deliveryChild);
  if (!pickupParent || !deliveryParent) {
    return { path: null, error: "Kho cha của địa chỉ lấy/giao hàng chưa hoạt động hoặc không tồn tại" };
  }

  const { data: regionalRows, error: regionalError } = await supabase
    .from("warehouses")
    .select("id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code")
    .eq("warehouse_level", WarehouseLevelCode.REGIONAL)
    .eq("status", "active");
  if (regionalError) return { path: null, error: regionalError.message };

  const regionals = (regionalRows ?? []) as PlannerWarehouse[];
  const regionalById = new Map(regionals.map((warehouse) => [warehouse.id, warehouse]));
  const regionalForParent = (parent: PlannerWarehouse): PlannerWarehouse | null => {
    const linkedRegional = parent.parent_warehouse_id ? regionalById.get(parent.parent_warehouse_id) : null;
    if (linkedRegional) return linkedRegional;
    return parent.region_code
      ? regionals.find((regional) => regional.region_code === parent.region_code) ?? null
      : null;
  };
  const pickupRegional = regionalForParent(pickupParent);
  const deliveryRegional = regionalForParent(deliveryParent);

  return {
    path: { pickupChild, pickupParent, pickupRegional, deliveryChild, deliveryParent, deliveryRegional },
    error: null,
  };
}

/**
 * Dựng tuyến có số chặng tối thiểu trong cây kho hiện tại.
 *
 * Mục tiêu ưu tiên là không đi qua một kho hai lần và không đi vòng qua hub
 * vùng khi hai kho tỉnh đã cùng vùng. Khi khác vùng, tuyến mới đi qua hub
 * nguồn và hub đích. Đây là tối ưu theo mạng kho, không giả định tọa độ GPS.
 */
function buildOptimizedLegRows(
  order: PlannerOrder,
  path: ResolvedWarehousePath,
): { rows: PlannedLegRow[]; strategy: AutomaticRouteResult["strategy"] } {
  const { pickupChild, pickupParent, pickupRegional, deliveryChild, deliveryParent, deliveryRegional } = path;
  // Dùng tên tỉnh theo kho hiện tại làm giá trị chuẩn cho trách nhiệm điều
  // phối. Địa chỉ khách hàng có thể vẫn dùng tên tỉnh cũ từ Google Maps.
  const pickupProvince = pickupParent.province || pickupChild.province;
  const deliveryProvince = deliveryParent.province || deliveryChild.province;
  const isSameChild = pickupChild.id === deliveryChild.id;
  const isSameProvince = pickupParent.id === deliveryParent.id;
  const isSameRegion = Boolean(
    pickupRegional?.id && deliveryRegional?.id && pickupRegional.id === deliveryRegional.id,
  );
  const strategy: AutomaticRouteResult["strategy"] = isSameChild
    ? "SAME_WAREHOUSE"
    : isSameProvince
      ? "SAME_PROVINCE"
      : !isSameRegion && pickupRegional && deliveryRegional
        ? "CROSS_REGION"
        : "CROSS_PROVINCE";

  const rows: PlannedLegRow[] = [{
    order_id: order.id,
    sequence_no: 1,
    leg_type: ShipmentLegType.PICKUP,
    from_warehouse_id: null,
    to_warehouse_id: pickupChild.id,
    responsibility_province: pickupProvince,
    status: ShipmentLegStatusCode.PENDING,
  }];
  let sequenceNo = 2;
  let lastWarehouseId = pickupChild.id;

  function appendTransfer(from: PlannerWarehouse, to: PlannerWarehouse, responsibilityProvince: string | null): void {
    if (from.id === to.id || from.id !== lastWarehouseId) return;
    rows.push({
      order_id: order.id,
      sequence_no: sequenceNo,
      leg_type: ShipmentLegType.TRANSFER,
      from_warehouse_id: from.id,
      to_warehouse_id: to.id,
      responsibility_province: responsibilityProvince,
      status: ShipmentLegStatusCode.PENDING,
    });
    sequenceNo += 1;
    lastWarehouseId = to.id;
  }

  appendTransfer(pickupChild, pickupParent, pickupProvince);

  if (!isSameChild && !isSameProvince) {
    if (strategy === "CROSS_REGION" && pickupRegional && deliveryRegional) {
      appendTransfer(pickupParent, pickupRegional, pickupProvince);
      appendTransfer(pickupRegional, deliveryRegional, pickupProvince);
      appendTransfer(deliveryRegional, deliveryParent, deliveryProvince);
    } else {
      // Cùng vùng hoặc dữ liệu cũ thiếu hub: đi thẳng giữa hai kho tỉnh.
      appendTransfer(pickupParent, deliveryParent, pickupProvince);
    }
  }

  appendTransfer(deliveryParent, deliveryChild, deliveryProvince);
  rows.push({
    order_id: order.id,
    sequence_no: sequenceNo,
    leg_type: ShipmentLegType.LAST_MILE,
    from_warehouse_id: deliveryChild.id,
    to_warehouse_id: null,
    responsibility_province: deliveryProvince,
    status: ShipmentLegStatusCode.PENDING,
  });

  return { rows, strategy };
}

export async function createAutomaticShipmentRoute(
  orderId: string,
  options: { allowedPickupWarehouseId?: string; allowedPickupProvince?: string } = {},
): Promise<{ data: AutomaticRouteResult | null; error: string | null; alreadyExists?: boolean }> {
  const supabase = getSupabaseServiceClient();
  const { data: orderRaw, error: orderError } = await supabase
    .from("orders")
    .select(orderSelect())
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) return { data: null, error: orderError.message };
  const order = orderRaw as unknown as PlannerOrder | null;
  if (!order) return { data: null, error: "Không tìm thấy đơn hàng" };

  const { data: existingLegs, error: existingError } = await supabase
    .from("shipment_legs")
    .select("id")
    .eq("order_id", order.id)
    .limit(1);
  if (existingError) return { data: null, error: existingError.message };
  if (existingLegs && existingLegs.length > 0) {
    return { data: null, error: "Đơn hàng đã được lập tuyến", alreadyExists: true };
  }

  const resolved = await resolveWarehousePath(order);
  if (resolved.error || !resolved.path) {
    return { data: null, error: resolved.error ?? "Không thể xác định tuyến kho" };
  }
  const isAllowedPickup = !options.allowedPickupWarehouseId
    || resolved.path.pickupChild.id === options.allowedPickupWarehouseId
    || (options.allowedPickupProvince
      && matchesProvince(resolved.path.pickupChild.province, options.allowedPickupProvince));
  if (!isAllowedPickup) {
    return { data: null, error: "Chỉ điều phối viên của kho lấy hàng mới được lập tuyến cho đơn này" };
  }

  const { pickupChild, deliveryChild } = resolved.path;
  if (order.pickup_warehouse_id !== pickupChild.id || order.delivery_warehouse_id !== deliveryChild.id) {
    const { error: warehouseAssignmentError } = await supabase
      .from("orders")
      .update({ pickup_warehouse_id: pickupChild.id, delivery_warehouse_id: deliveryChild.id })
      .eq("id", order.id);
    if (warehouseAssignmentError) return { data: null, error: warehouseAssignmentError.message };
  }

  const { rows, strategy } = buildOptimizedLegRows(order, resolved.path);
  const { data: createdLegs, error: legsError } = await supabase
    .from("shipment_legs")
    .insert(rows)
    .select("*")
    .order("sequence_no");
  if (legsError) return { data: null, error: legsError.message };

  if (order.order_statuses?.code === OrderStatusCode.CREATED) {
    const { data: pendingStatus } = await supabase
      .from("order_statuses")
      .select("id")
      .eq("code", OrderStatusCode.PENDING_ASSIGNMENT)
      .maybeSingle();
    if (pendingStatus) {
      await supabase.from("orders").update({ status_id: pendingStatus.id }).eq("id", order.id);
    }
  }

  return {
    data: {
      order_id: order.id,
      legs: (createdLegs ?? []) as unknown[],
      route: {
        pickup_child: pickupChild,
        pickup_parent: resolved.path.pickupParent,
        pickup_regional: resolved.path.pickupRegional,
        delivery_parent: resolved.path.deliveryParent,
        delivery_child: deliveryChild,
        delivery_regional: resolved.path.deliveryRegional,
      },
      strategy,
    },
    error: null,
  };
}

export interface ReturnRouteResult {
  order_id: string;
  legs: unknown[];
}

/**
 * Lập tuyến hoàn hàng khi đơn đã hết số lần giao và kho phát đã nhận lại kiện.
 *
 * Tuyến hoàn đi ngược tuyến giao theo cùng thuật toán tối thiểu số chặng:
 * kho phát -> kho tỉnh -> (hub vùng) -> kho tỉnh -> kho nhận ban đầu, rồi
 * chặng giao cuối trả hàng cho người gửi. Không có chặng lấy hàng vì kiện
 * đang nằm ở kho. Hàm idempotent: gọi lại khi đã có tuyến hoàn sẽ không tạo thêm.
 */
export async function createReturnShipmentRoute(
  orderId: string,
): Promise<{ data: ReturnRouteResult | null; error: string | null; alreadyExists?: boolean }> {
  const supabase = getSupabaseServiceClient();
  const { data: orderRaw, error: orderError } = await supabase
    .from("orders")
    .select(orderSelect())
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) return { data: null, error: orderError.message };
  const order = orderRaw as unknown as PlannerOrder | null;
  if (!order) return { data: null, error: "Không tìm thấy đơn hàng" };

  const { data: existingLegs, error: legsError } = await supabase
    .from("shipment_legs")
    .select("sequence_no, is_return")
    .eq("order_id", order.id)
    .order("sequence_no", { ascending: false });
  if (legsError) return { data: null, error: legsError.message };
  if ((existingLegs ?? []).some((leg) => leg.is_return)) {
    return { data: null, error: "Đơn hàng đã có tuyến hoàn", alreadyExists: true };
  }
  const lastSequenceNo = existingLegs?.[0]?.sequence_no ?? 0;

  const resolved = await resolveWarehousePath(order);
  if (resolved.error || !resolved.path) {
    return { data: null, error: resolved.error ?? "Không thể xác định tuyến hoàn" };
  }
  const forward = resolved.path;
  const reversedPath: ResolvedWarehousePath = {
    pickupChild: forward.deliveryChild,
    pickupParent: forward.deliveryParent,
    pickupRegional: forward.deliveryRegional,
    deliveryChild: forward.pickupChild,
    deliveryParent: forward.pickupParent,
    deliveryRegional: forward.pickupRegional,
  };

  // Bỏ chặng lấy hàng đầu tiên: kiện đang ở kho phát, chỉ cần trung chuyển ngược.
  const { rows } = buildOptimizedLegRows(order, reversedPath);
  const returnRows = rows
    .filter((row) => row.leg_type !== ShipmentLegType.PICKUP)
    .map((row, index) => ({ ...row, sequence_no: lastSequenceNo + index + 1, is_return: true }));

  const { data: createdLegs, error: insertError } = await supabase
    .from("shipment_legs")
    .insert(returnRows)
    .select("*")
    .order("sequence_no");
  if (insertError) return { data: null, error: insertError.message };

  const { data: returningStatus } = await supabase
    .from("order_statuses")
    .select("id")
    .eq("code", OrderStatusCode.RETURNING)
    .maybeSingle();
  if (returningStatus) {
    await supabase.from("orders").update({ status_id: returningStatus.id }).eq("id", order.id);
  }

  return { data: { order_id: order.id, legs: (createdLegs ?? []) as unknown[] }, error: null };
}
