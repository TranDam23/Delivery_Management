import { normalizePhone, RoleCode } from "@delivery/shared";
import type { AuthTokenPayload } from "@delivery/shared";
import { getUserOperationalScope } from "@/lib/dispatcher-scope";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

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
      const { data, error } = await db.from("warehouses").select("id").eq("province", scope.province);
      if (error) return { ids: [], error: error.message };
      warehouseIds = (data ?? []).map((row) => row.id);
    }
    if (!warehouseIds.length) return { ids: [], error: null };
    const { data, error } = await db.from("orders").select("id")
      .or(`pickup_warehouse_id.in.(${warehouseIds.join(",")}),delivery_warehouse_id.in.(${warehouseIds.join(",")})`);
    return { ids: (data ?? []).map((row) => row.id), error: error?.message ?? null };
  }
  if (auth.roleCode === RoleCode.DELIVERY_STAFF) {
    const { data, error } = await db.from("deliveries").select("order_id").eq("delivery_staff_id", auth.userId);
    return { ids: Array.from(new Set((data ?? []).map((row) => row.order_id))), error: error?.message ?? null };
  }
  if (auth.roleCode === RoleCode.CUSTOMER) {
    const { data: user, error: userError } = await db.from("users").select("phone").eq("id", auth.userId).maybeSingle();
    if (userError) return { ids: [], error: userError.message };
    const phone = normalizePhone(user?.phone ?? "");
    const { data: contacts, error: contactError } = await db.from("contacts").select("id, user_id, phone")
      .or(phone ? `user_id.eq.${auth.userId},phone.eq.${phone}` : `user_id.eq.${auth.userId}`);
    if (contactError) return { ids: [], error: contactError.message };
    const senderIds = (contacts ?? []).filter((contact) => contact.user_id === auth.userId || (phone && normalizePhone(contact.phone) === phone)).map((contact) => contact.id);
    const [created, sent] = await Promise.all([
      db.from("orders").select("id").eq("created_by", auth.userId),
      senderIds.length ? db.from("orders").select("id").in("sender_id", senderIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (created.error || sent.error) return { ids: [], error: created.error?.message ?? sent.error?.message ?? "Không tải được đơn" };
    const ids = Array.from(new Set([...(created.data ?? []), ...(sent.data ?? [])].map((row) => row.id)));
    if (!ids.length) return { ids, error: null };
    const { data: guestOrders, error } = await db.from("guest_orders").select("order_id").in("order_id", ids);
    if (error) return { ids: [], error: error.message };
    const guestIds = new Set((guestOrders ?? []).map((row) => row.order_id));
    return { ids: ids.filter((id) => !guestIds.has(id)), error: null };
  }
  return { ids: [], error: "Forbidden" };
}
