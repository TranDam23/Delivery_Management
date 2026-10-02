import type { NextRequest } from "next/server";
import { z } from "zod";
import { CodTransactionStatus, OrderStatusCode, RoleCode, normalizePhone } from "@delivery/shared";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { checkOrderViewAccess } from "@/lib/order-access";
import { getUserOperationalScope } from "@/lib/dispatcher-scope";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { CodListItem, CodState } from "@/lib/cod";

const actionSchema = z.object({ orderId: z.string().uuid() });

async function scopedOrderIds(auth: NonNullable<ReturnType<typeof getAuthFromRequest>>) {
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

export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DISPATCHER && auth.roleCode !== RoleCode.CUSTOMER && auth.roleCode !== RoleCode.DELIVERY_STAFF) return fail("Forbidden", 403);
  const page = Math.max(1, Math.min(10000, Number(request.nextUrl.searchParams.get("page")) || 1));
  const pageSize = 20;
  const scope = await scopedOrderIds(auth);
  if (scope.error) return fail(scope.error, scope.error === "Forbidden" ? 403 : 500);
  if (scope.ids !== null && !scope.ids.length) return ok({ items: [], total: 0, page, pageSize });
  const db = getSupabaseServiceClient();
  let query = db.from("orders").select("id, tracking_code, cod_amount, order_statuses(code), sender:contacts!orders_sender_id_fkey(name)", { count: "exact" })
    .gt("cod_amount", 0).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (scope.ids !== null) query = query.in("id", scope.ids);
  const { data: orders, error, count } = await query;
  if (error) return fail(error.message, 500);
  const ids = (orders ?? []).map((row) => row.id);
  const { data: transactions, error: transactionError } = ids.length
    ? await db.from("cod_transactions").select("order_id, amount, status, collected_at, reconciled_at, collected_by, reconciled_by").in("order_id", ids)
    : { data: [], error: null };
  if (transactionError) return fail(transactionError.message, 500);
  const byOrder = new Map((transactions ?? []).map((row) => [row.order_id, row]));
  const items: CodListItem[] = (orders ?? []).map((order) => {
    const transaction = byOrder.get(order.id);
    return {
      id: order.id,
      trackingCode: order.tracking_code,
      senderName: order.sender?.name ?? "—",
      amount: Number(order.cod_amount),
      orderStatus: order.order_statuses?.code ?? "",
      codStatus: (transaction?.status ?? "pending") as CodState,
      collectedAt: transaction?.collected_at ?? null,
      reconciledAt: transaction?.reconciled_at ?? null,
      collectedBy: transaction?.collected_by ?? null,
      reconciledBy: transaction?.reconciled_by ?? null,
    };
  });
  return ok({ items, total: count ?? 0, page, pageSize });
}

/** Chỉ xác nhận số tiền đã thu khớp với đơn; không đồng nghĩa đã chuyển trả người gửi. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DISPATCHER) return fail("Forbidden", 403);
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Mã đơn không hợp lệ", 400);
  const db = getSupabaseServiceClient();
  const access = await checkOrderViewAccess(db, auth, parsed.data.orderId);
  if (!access.allowed) return fail(access.error, access.status);
  const { data: order, error: orderError } = await db.from("orders")
    .select("id, cod_amount, order_statuses(code)").eq("id", parsed.data.orderId).maybeSingle();
  if (orderError) return fail(orderError.message, 500);
  if (!order || Number(order.cod_amount) <= 0) return fail("Đơn không có COD", 409);
  if (order.order_statuses?.code !== OrderStatusCode.DELIVERED) return fail("Chỉ đối soát đơn đã giao thành công", 409);
  const { data: transaction, error: transactionError } = await db.from("cod_transactions")
    .select("id, amount, status, collected_by, collected_at")
    .eq("order_id", parsed.data.orderId).maybeSingle();
  if (transactionError) return fail(transactionError.message, 500);
  if (!transaction || transaction.status !== CodTransactionStatus.COLLECTED || !transaction.collected_by || !transaction.collected_at) {
    return fail("Đơn chưa được ghi nhận thu COD hoặc đã đối soát", 409);
  }
  if (Number(transaction.amount) !== Number(order.cod_amount)) return fail("Tiền đã thu không khớp tiền COD của đơn", 409);
  const { data: deliveredStatus } = await db.from("order_statuses").select("id").eq("code", OrderStatusCode.DELIVERED).maybeSingle();
  if (!deliveredStatus) return fail("Thiếu trạng thái giao thành công", 500);
  const { data: proof, error: proofError } = await db.from("delivery_events").select("id")
    .eq("order_id", parsed.data.orderId).eq("status_id", deliveredStatus.id).not("image_url", "is", null).limit(1).maybeSingle();
  if (proofError) return fail(proofError.message, 500);
  if (!proof) return fail("Chưa có ảnh xác thực giao hàng", 409);
  const { data: reconciled, error: updateError } = await db.from("cod_transactions")
    .update({ status: CodTransactionStatus.RECONCILED, reconciled_at: new Date().toISOString(), reconciled_by: auth.userId })
    .eq("id", transaction.id).eq("status", CodTransactionStatus.COLLECTED)
    .select("id").maybeSingle();
  if (updateError) return fail(updateError.message, 500);
  if (!reconciled) return fail("COD đã được đối soát bởi người khác. Hãy làm mới danh sách.", 409);
  return ok({ orderId: parsed.data.orderId, status: CodTransactionStatus.RECONCILED });
}
