import { RoleCode, WarehouseLevelCode, WarehouseStatusCode, type AuthTokenPayload } from "@delivery/shared";
import type { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getUserOperationalScope } from "@/lib/dispatcher-scope";

type ServiceClient = ReturnType<typeof getSupabaseServiceClient>;

const ACCESS_BATCH_SIZE = 1000;

type OrderAccessRow = {
  id: string;
  receiver_user_id: string | null;
};

type AccessResult<T> = {
  rows: T[];
  error: string | null;
};

export type OrderViewAccess =
  | { allowed: true; canConfirmReceipt: boolean; isCustomerParticipant: boolean }
  | { allowed: false; error: string; status: number };

async function fetchAllRows<T>(
  load: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<AccessResult<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += ACCESS_BATCH_SIZE) {
    const result = await load(from, from + ACCESS_BATCH_SIZE - 1);
    if (result.error) return { rows: [], error: result.error.message };
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < ACCESS_BATCH_SIZE) return { rows, error: null };
  }
}

async function orderIdsForWarehouses(
  supabase: ServiceClient,
  warehouseIds: string[],
): Promise<{ ids: string[]; error: string | null }> {
  const ids = new Set<string>();
  for (let offset = 0; offset < warehouseIds.length; offset += 100) {
    const batch = warehouseIds.slice(offset, offset + 100);
    const filter = `pickup_warehouse_id.in.(${batch.join(",")}),delivery_warehouse_id.in.(${batch.join(",")})`;
    const [orders, legs] = await Promise.all([
      fetchAllRows<{ id: string }>(async (from, to) => await supabase
        .from("orders")
        .select("id")
        .or(filter)
        .order("id", { ascending: true })
        .range(from, to)),
      fetchAllRows<{ order_id: string }>(async (from, to) => await supabase
        .from("shipment_legs")
        .select("order_id")
        .or(`from_warehouse_id.in.(${batch.join(",")}),to_warehouse_id.in.(${batch.join(",")})`)
        .order("order_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)),
    ]);
    if (orders.error) return { ids: [], error: orders.error };
    if (legs.error) return { ids: [], error: legs.error };
    orders.rows.forEach((order) => ids.add(order.id));
    legs.rows.forEach((leg) => ids.add(leg.order_id));
  }
  return { ids: Array.from(ids), error: null };
}

/**
 * Returns the order IDs visible to a role. `ids: null` means unrestricted
 * access and is reserved for ADMIN.
 */
export async function getVisibleOrderIds(
  supabase: ServiceClient,
  auth: AuthTokenPayload,
  direction?: "sent" | "received",
): Promise<{ ids: string[] | null; error: string | null; status?: number }> {
  if (auth.roleCode === RoleCode.ADMIN) return { ids: null, error: null };

  if (
    auth.roleCode === RoleCode.DISPATCHER
    || auth.roleCode === RoleCode.WAREHOUSE_STAFF
  ) {
    const scope = await getUserOperationalScope(auth);
    if (scope.error) return { ids: [], error: scope.error, status: 500 };
    if (!scope.warehouseId) {
      return { ids: [], error: "Tài khoản chưa được gán kho phụ trách", status: 409 };
    }

    let warehouseIds = [scope.warehouseId];
    if (auth.roleCode === RoleCode.DISPATCHER && scope.warehouseLevel === WarehouseLevelCode.PROVINCE) {
      const provinceWarehouses = await fetchAllRows<{ id: string }>(async (from, to) => await supabase
        .from("warehouses")
        .select("id")
        .eq("province", scope.province ?? "")
        .eq("status", WarehouseStatusCode.ACTIVE)
        .order("id", { ascending: true })
        .range(from, to));
      if (provinceWarehouses.error) return { ids: [], error: provinceWarehouses.error };
      warehouseIds = provinceWarehouses.rows.map((warehouse) => warehouse.id);
    }

    const visibleOrders = await orderIdsForWarehouses(supabase, warehouseIds);
    return { ids: visibleOrders.ids, error: visibleOrders.error };
  }

  if (auth.roleCode === RoleCode.DELIVERY_STAFF) {
    const [deliveries, legs] = await Promise.all([
      fetchAllRows<{ order_id: string }>(async (from, to) => await supabase
        .from("deliveries")
        .select("order_id, shipment_leg_id")
        .eq("delivery_staff_id", auth.userId)
        .is("shipment_leg_id", null)
        .order("order_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)),
      fetchAllRows<{ order_id: string }>(async (from, to) => await supabase
        .from("shipment_legs")
        .select("order_id")
        .eq("assigned_staff_id", auth.userId)
        .order("order_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)),
    ]);
    if (deliveries.error) return { ids: [], error: deliveries.error };
    if (legs.error) return { ids: [], error: legs.error };
    return {
      ids: Array.from(new Set([
        ...deliveries.rows.map((delivery) => delivery.order_id),
        ...legs.rows.map((leg) => leg.order_id),
      ])),
      error: null,
    };
  }

  if (auth.roleCode === RoleCode.CUSTOMER) {
    const [sentOrders, receivedOrders] = await Promise.all([
      direction === "received"
        ? Promise.resolve({ rows: [], error: null })
        : fetchAllRows<{ id: string }>(async (from, to) => await supabase
          .from("orders")
          .select("id")
          .eq("sender_user_id", auth.userId)
          .order("id", { ascending: true })
          .range(from, to)),
      direction === "sent"
        ? Promise.resolve({ rows: [], error: null })
        : fetchAllRows<{ id: string }>(async (from, to) => await supabase
          .from("orders")
          .select("id")
          .eq("receiver_user_id", auth.userId)
          .order("id", { ascending: true })
          .range(from, to)),
    ]);
    if (sentOrders.error) return { ids: [], error: sentOrders.error };
    if (receivedOrders.error) return { ids: [], error: receivedOrders.error };

    return {
      ids: Array.from(new Set([
        ...sentOrders.rows.map((order) => order.id),
        ...receivedOrders.rows.map((order) => order.id),
      ])),
      error: null,
    };
  }

  return { ids: [], error: "Forbidden", status: 403 };
}

/**
 * Checks the same role-specific order scope used by the order list before a
 * detail or related endpoint returns order data.
 */
export async function checkOrderViewAccess(
  supabase: ServiceClient,
  auth: AuthTokenPayload,
  orderId: string,
): Promise<OrderViewAccess> {
  const scope = await getVisibleOrderIds(supabase, auth);
  if (scope.error) {
    return { allowed: false, error: scope.error, status: scope.status ?? 500 };
  }
  if (scope.ids && !scope.ids.includes(orderId)) {
    return { allowed: false, error: "Forbidden", status: 403 };
  }

  const { data: accessRaw, error: accessError } = await supabase
    .from("orders")
    .select("id, receiver_user_id")
    .eq("id", orderId)
    .maybeSingle();
  if (accessError) return { allowed: false, error: accessError.message, status: 500 };
  const access = accessRaw as OrderAccessRow | null;
  if (!access) return { allowed: false, error: "Order not found", status: 404 };

  let canConfirmReceipt = auth.roleCode === RoleCode.ADMIN;
  if (auth.roleCode === RoleCode.CUSTOMER) {
    canConfirmReceipt = access.receiver_user_id === auth.userId;
  }

  return {
    allowed: true,
    canConfirmReceipt,
    isCustomerParticipant: auth.roleCode === RoleCode.CUSTOMER,
  };
}
