import { normalizePhone, RoleCode } from "@delivery/shared";
import type { AuthTokenPayload } from "@delivery/shared";
import { getUserOperationalScope } from "@/lib/dispatcher-scope";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const SCOPE_BATCH_SIZE = 1000;

async function fetchAllRows<T>(
  load: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += SCOPE_BATCH_SIZE) {
    const result = await load(from, from + SCOPE_BATCH_SIZE - 1);
    if (result.error) return { rows: [], error: result.error.message };
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < SCOPE_BATCH_SIZE) return { rows, error: null };
  }
}

async function fetchOrderIdsForWarehouses(db: ReturnType<typeof getSupabaseServiceClient>, warehouseIds: string[]) {
  const orderIds = new Set<string>();
  for (let offset = 0; offset < warehouseIds.length; offset += 100) {
    const batch = warehouseIds.slice(offset, offset + 100);
    const result = await fetchAllRows<{ id: string }>(async (from, to) => await db.from("orders").select("id")
      .or(`pickup_warehouse_id.in.(${batch.join(",")}),delivery_warehouse_id.in.(${batch.join(",")})`)
      .order("id", { ascending: true })
      .range(from, to));
    if (result.error) return { ids: [], error: result.error };
    result.rows.forEach((row) => orderIds.add(row.id));
  }
  return { ids: [...orderIds], error: null };
}

/**
 * Tập đơn hàng mà một tài khoản được phép thấy (null = toàn bộ, chỉ Admin).
 * Dùng chung cho COD, cảnh báo và thống kê để phạm vi nhất quán với danh sách đơn.
 */
export async function scopedOrderIds(auth: AuthTokenPayload) {
  const db = getSupabaseServiceClient();
  if (auth.roleCode === RoleCode.ADMIN) return { ids: null as string[] | null, error: null as string | null };
  if (auth.roleCode === RoleCode.DISPATCHER) {
    const scope = await getUserOperationalScope(auth);
    if (scope.error) return { ids: [], error: scope.error };
    if (!scope.warehouseId) return { ids: [], error: "Tài khoản chưa được gán kho phụ trách" };
    let warehouseIds = [scope.warehouseId];
    if (scope.warehouseLevel === "PROVINCE" && scope.province) {
      const province = scope.province;
      const warehouses = await fetchAllRows<{ id: string }>(async (from, to) => await db.from("warehouses").select("id")
        .eq("province", province).order("id", { ascending: true }).range(from, to));
      if (warehouses.error) return { ids: [], error: warehouses.error };
      warehouseIds = warehouses.rows.map((row) => row.id);
    }
    if (!warehouseIds.length) return { ids: [], error: null };
    return fetchOrderIdsForWarehouses(db, warehouseIds);
  }
  if (auth.roleCode === RoleCode.DELIVERY_STAFF) {
    const deliveries = await fetchAllRows<{ order_id: string }>(async (from, to) => await db.from("deliveries")
      .select("order_id").eq("delivery_staff_id", auth.userId)
      .order("order_id", { ascending: true }).order("id", { ascending: true }).range(from, to));
    return { ids: Array.from(new Set(deliveries.rows.map((row) => row.order_id))), error: deliveries.error };
  }
  if (auth.roleCode === RoleCode.CUSTOMER) {
    const { data: user, error: userError } = await db.from("users").select("phone").eq("id", auth.userId).maybeSingle();
    if (userError) return { ids: [], error: userError.message };
    const phone = normalizePhone(user?.phone ?? "");
    const contacts = await fetchAllRows<{ id: string; user_id: string | null; phone: string | null }>(async (from, to) => await db.from("contacts").select("id, user_id, phone")
      .or(phone ? `user_id.eq.${auth.userId},phone.eq.${phone}` : `user_id.eq.${auth.userId}`)
      .order("id", { ascending: true }).range(from, to));
    if (contacts.error) return { ids: [], error: contacts.error };
    const senderIds = contacts.rows.filter((contact) => contact.user_id === auth.userId || (phone && normalizePhone(contact.phone ?? "") === phone)).map((contact) => contact.id);
    const created = await fetchAllRows<{ id: string }>(async (from, to) => await db.from("orders").select("id")
      .eq("created_by", auth.userId).order("id", { ascending: true }).range(from, to));
    if (created.error) return { ids: [], error: created.error };
    const sentIds = new Set<string>();
    for (let offset = 0; offset < senderIds.length; offset += 1000) {
      const senderBatch = senderIds.slice(offset, offset + 1000);
      const sent = await fetchAllRows<{ id: string }>(async (from, to) => await db.from("orders").select("id")
        .in("sender_id", senderBatch).order("id", { ascending: true }).range(from, to));
      if (sent.error) return { ids: [], error: sent.error };
      sent.rows.forEach((row) => sentIds.add(row.id));
    }
    const ids = Array.from(new Set([...created.rows.map((row) => row.id), ...sentIds]));
    if (!ids.length) return { ids, error: null };
    const guestIds = new Set<string>();
    for (let offset = 0; offset < ids.length; offset += 1000) {
      const idBatch = ids.slice(offset, offset + 1000);
      const guestOrders = await fetchAllRows<{ order_id: string }>(async (from, to) => await db.from("guest_orders").select("order_id")
        .in("order_id", idBatch).order("order_id", { ascending: true }).range(from, to));
      if (guestOrders.error) return { ids: [], error: guestOrders.error };
      guestOrders.rows.forEach((row) => guestIds.add(row.order_id));
    }
    return { ids: ids.filter((id) => !guestIds.has(id)), error: null };
  }
  return { ids: [], error: "Forbidden" };
}
