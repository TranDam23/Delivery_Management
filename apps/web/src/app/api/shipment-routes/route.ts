import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  RoleCode,
  WarehouseLevelCode,
} from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import {
  getUserOperationalScope,
  warehouseBelongsToScope,
  type OperationalWarehouseScope,
} from "@/lib/dispatcher-scope";
import { selectNearestWarehouse } from "@/lib/shipment-routing";
import { createAutomaticShipmentRoute } from "@/lib/shipment-route-planner";
import { fetchActiveCommuneWarehouses } from "@/lib/warehouse-queries";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const routeSchema = z.object({
  order_id: z.string().uuid().optional(),
  all: z.boolean().optional().default(false),
}).refine((value) => Boolean(value.order_id) || value.all, {
  message: "Cần truyền order_id hoặc all=true",
});

interface PlanningOrder {
  id: string;
  tracking_code: string;
  status_id: string;
  created_at: string;
  pickup_warehouse_id: string | null;
  delivery_warehouse_id: string | null;
  order_statuses: { code: string; name: string } | null;
  pickup_warehouse: WarehouseRow | null;
  delivery_warehouse: WarehouseRow | null;
  pickup_address: {
    address_line: string;
    ward: string | null;
    district: string | null;
    province: string | null;
  } | null;
  delivery_address: {
    address_line: string;
    ward: string | null;
    district: string | null;
    province: string | null;
  } | null;
  order_items?: Array<{ id: string; item_name: string; quantity: number; weight: number | null }>;
}

interface PlanningLeg {
  id: string;
  order_id: string;
  sequence_no: number;
  leg_type: string;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  assigned_staff_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  responsibility_province: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface WarehouseRow {
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
}

interface StaffRow {
  id: string;
  full_name: string;
  phone: string | null;
}

interface RouteLegWithDetails extends PlanningLeg {
  from_warehouse: WarehouseRow | null;
  to_warehouse: WarehouseRow | null;
  assigned_staff: StaffRow | null;
}

interface RouteItem {
  order: PlanningOrder;
  legs: RouteLegWithDetails[];
}

function canManageRoutes(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.DISPATCHER;
}

function orderSelect(): string {
  return `id, tracking_code, status_id, created_at, pickup_warehouse_id, delivery_warehouse_id,
    order_statuses(code, name),
    pickup_warehouse:warehouses!orders_pickup_warehouse_id_fkey(id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code),
    delivery_warehouse:warehouses!orders_delivery_warehouse_id_fkey(id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code),
    pickup_address:addresses!orders_pickup_address_id_fkey(address_line, ward, district, province),
    delivery_address:addresses!orders_delivery_address_id_fkey(address_line, ward, district, province)`;
}

async function getRouteItems(orderId?: string, dispatcherScope?: OperationalWarehouseScope, includeItems = false): Promise<
  | { items: RouteItem[]; error: null }
  | { items: []; error: string }
> {
  const supabase = getSupabaseServiceClient();
  let orderQuery = supabase.from("orders").select(orderSelect()).order("created_at", { ascending: false });
  if (orderId) orderQuery = orderQuery.eq("id", orderId);

  const [{ data: ordersRaw, error: ordersError }, { data: legsRaw, error: legsError }] = await Promise.all([
    orderQuery,
    supabase.from("shipment_legs").select("*").order("sequence_no"),
  ]);
  if (ordersError) return { items: [], error: ordersError.message };
  if (legsError) return { items: [], error: legsError.message };

  const orders = (ordersRaw ?? []) as unknown as PlanningOrder[];
  const legs = (legsRaw ?? []) as PlanningLeg[];
  const itemRowsResult = includeItems && orders.length > 0
    ? await supabase.from("order_items").select("id, order_id, item_name, quantity, weight").in("order_id", orders.map((order) => order.id))
    : { data: [], error: null };
  if (itemRowsResult.error) return { items: [], error: itemRowsResult.error.message };
  const itemsByOrder = new Map<string, NonNullable<PlanningOrder["order_items"]>>();
  for (const row of itemRowsResult.data ?? []) {
    const current = itemsByOrder.get(row.order_id) ?? [];
    current.push({ id: row.id, item_name: row.item_name, quantity: row.quantity, weight: row.weight });
    itemsByOrder.set(row.order_id, current);
  }
  const warehouseIds = Array.from(
    new Set(
      legs.flatMap((leg) => [leg.from_warehouse_id, leg.to_warehouse_id]).filter(Boolean) as string[],
    ),
  );
  const staffIds = Array.from(new Set(legs.map((leg) => leg.assigned_staff_id).filter(Boolean) as string[]));

  const [{ data: warehouses, error: warehousesError }, { data: staff, error: staffError }] = await Promise.all([
    warehouseIds.length > 0
      ? supabase
          .from("warehouses")
          .select("id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code")
          .in("id", warehouseIds)
      : Promise.resolve({ data: [], error: null }),
    staffIds.length > 0
      ? supabase.from("users").select("id, full_name, phone").in("id", staffIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (warehousesError) return { items: [], error: warehousesError.message };
  if (staffError) return { items: [], error: staffError.message };

  let allWarehouses = (warehouses as WarehouseRow[] | null ?? []);
  if (dispatcherScope?.warehouseId) {
    const { data: activeChildren, error: childrenError } = await fetchActiveCommuneWarehouses<WarehouseRow>(
      "id, code, name, ward, province, district, status, warehouse_level, parent_warehouse_id, region_code",
    );
    if (childrenError) return { items: [], error: childrenError };
    const warehouseMap = new Map(allWarehouses.map((warehouse) => [warehouse.id, warehouse]));
    activeChildren.forEach((warehouse) => warehouseMap.set(warehouse.id, warehouse));
    allWarehouses = Array.from(warehouseMap.values());
  }

  const warehouseById = new Map(allWarehouses.map((warehouse) => [warehouse.id, warehouse]));
  const staffById = new Map((staff as StaffRow[] | null ?? []).map((member) => [member.id, member]));
  const legsByOrder = new Map<string, PlanningLeg[]>();
  legs.forEach((leg) => {
    const current = legsByOrder.get(leg.order_id) ?? [];
    current.push(leg);
    legsByOrder.set(leg.order_id, current);
  });

  const items: RouteItem[] = orders.map((order) => ({
    order: includeItems ? { ...order, order_items: itemsByOrder.get(order.id) ?? [] } : order,
    legs: (legsByOrder.get(order.id) ?? []).map((leg) => ({
      ...leg,
      from_warehouse: leg.from_warehouse_id ? warehouseById.get(leg.from_warehouse_id) ?? null : null,
      to_warehouse: leg.to_warehouse_id ? warehouseById.get(leg.to_warehouse_id) ?? null : null,
      assigned_staff: leg.assigned_staff_id ? staffById.get(leg.assigned_staff_id) ?? null : null,
    })),
  }));

  if (!dispatcherScope?.warehouseId) return { items, error: null };

  const activeChildren = allWarehouses.filter(
    (warehouse) => warehouse.warehouse_level === WarehouseLevelCode.COMMUNE && warehouse.status === "active",
  );

  return {
    items: items
      .filter((item) => {
        const assignedPickupWarehouse = item.order.pickup_warehouse_id
          ? warehouseById.get(item.order.pickup_warehouse_id) ?? null
          : null;
        const assignedDeliveryWarehouse = item.order.delivery_warehouse_id
          ? warehouseById.get(item.order.delivery_warehouse_id) ?? null
          : null;
        const pickupWarehouse = assignedPickupWarehouse?.status === "active"
          ? assignedPickupWarehouse
          : item.order.pickup_address
            ? selectNearestWarehouse(item.order.pickup_address, activeChildren)
            : null;
        const deliveryWarehouse = assignedDeliveryWarehouse?.status === "active"
          ? assignedDeliveryWarehouse
          : item.order.delivery_address
            ? selectNearestWarehouse(item.order.delivery_address, activeChildren)
            : null;
        // Đơn chưa có chặng chỉ thuộc hàng đợi lập tuyến của điều phối viên
        // tại tỉnh/kho lấy hàng. Điều phối viên kho đích chỉ nhận phần giao
        // cuối sau khi tuyến đã được tạo.
        if (item.legs.length === 0) return warehouseBelongsToScope(dispatcherScope, pickupWarehouse);
        return warehouseBelongsToScope(dispatcherScope, pickupWarehouse)
          || warehouseBelongsToScope(dispatcherScope, deliveryWarehouse)
          || item.legs.some((leg) =>
            warehouseBelongsToScope(dispatcherScope, leg.from_warehouse_id ? warehouseById.get(leg.from_warehouse_id) : null)
              || warehouseBelongsToScope(dispatcherScope, leg.to_warehouse_id ? warehouseById.get(leg.to_warehouse_id) : null),
          );
      })
      .map((item) => ({
        ...item,
        // Chỉ trả các chặng chạm kho/tỉnh phụ trách. Chặng TRANSFER vẫn hiển
        // thị để theo dõi, nhưng không được điều phối viên phân công.
        legs: item.legs.filter((leg) =>
          warehouseBelongsToScope(dispatcherScope, leg.from_warehouse_id ? warehouseById.get(leg.from_warehouse_id) : null)
            || warehouseBelongsToScope(dispatcherScope, leg.to_warehouse_id ? warehouseById.get(leg.to_warehouse_id) : null),
        ),
      })),
    error: null,
  };
}

/** GET /api/shipment-routes — xem các đơn chưa phân tuyến hoặc đã có chặng. */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageRoutes(auth.roleCode)) return fail("Forbidden", 403);

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("order_id") ?? undefined;
  const filter = searchParams.get("status") ?? "all";
  if (!["all", "unplanned", "planned"].includes(filter)) return fail("status không hợp lệ");

  const warehouseScope = await getUserOperationalScope(auth);
  if (warehouseScope.error) return fail(warehouseScope.error, 500);
  if (auth.roleCode === RoleCode.DISPATCHER && !warehouseScope.warehouseId) {
    return ok([]);
  }

  const result = await getRouteItems(orderId, auth.roleCode === RoleCode.DISPATCHER ? warehouseScope : undefined, true);
  if (result.error) return fail(result.error, 500);

  const items = result.items.filter((item) => {
    const hasLegs = Array.isArray(item.legs) && item.legs.length > 0;
    return filter === "unplanned" ? !hasLegs : filter === "planned" ? hasLegs : true;
  });
  return ok(items);
}

/**
 * POST /api/shipment-routes — lập bổ sung tuyến cho dữ liệu cũ chưa có chặng.
 *
 * Đơn mới được lập tuyến tự động ngay trong API tạo đơn. Endpoint này vẫn
 * được giữ để điều phối viên xử lý các đơn cũ hoặc đơn bị lỗi dữ liệu.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageRoutes(auth.roleCode)) return fail("Forbidden", 403);

  const parsed = routeSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const warehouseScope = await getUserOperationalScope(auth);
  if (warehouseScope.error) return fail(warehouseScope.error, 500);
  if (auth.roleCode === RoleCode.DISPATCHER && !warehouseScope.warehouseId) {
    return fail("Tài khoản điều phối viên chưa được gán kho phụ trách", 409);
  }

  if (parsed.data.all) {
    const routeItems = await getRouteItems(
      undefined,
      auth.roleCode === RoleCode.DISPATCHER ? warehouseScope : undefined,
    );
    if (routeItems.error) return fail(routeItems.error, 500);

    const candidates = routeItems.items.filter((item) => item.legs.length === 0);
    const results = await Promise.all(candidates.map((item) => createAutomaticShipmentRoute(item.order.id, {
      allowedPickupWarehouseId: auth.roleCode === RoleCode.DISPATCHER
        ? warehouseScope.warehouseId ?? undefined
        : undefined,
      allowedPickupProvince: auth.roleCode === RoleCode.DISPATCHER
        && warehouseScope.warehouseLevel === WarehouseLevelCode.PROVINCE
        ? warehouseScope.province ?? undefined
        : undefined,
    })));
    const failures = results.flatMap((result, index) => result.error
      ? [{ order_id: candidates[index]?.order.id ?? "", tracking_code: candidates[index]?.order.tracking_code ?? "", error: result.error }]
      : []);

    return ok({
      total: candidates.length,
      planned: candidates.length - failures.length,
      failed: failures.length,
      failures,
    });
  }

  if (!parsed.data.order_id) return fail("Thiếu order_id", 400);
  const result = await createAutomaticShipmentRoute(parsed.data.order_id, {
    allowedPickupWarehouseId: auth.roleCode === RoleCode.DISPATCHER
      ? warehouseScope.warehouseId ?? undefined
      : undefined,
    allowedPickupProvince: auth.roleCode === RoleCode.DISPATCHER
      && warehouseScope.warehouseLevel === WarehouseLevelCode.PROVINCE
      ? warehouseScope.province ?? undefined
      : undefined,
  });
  if (result.error) {
    return fail(result.error, result.alreadyExists ? 409 : 400);
  }
  return ok(result.data, 201);
}
