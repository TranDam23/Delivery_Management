import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ContactType,
  OrderStatusCode,
  RoleCode,
  canBeReceiver,
  canBeSender,
  type AuthTokenPayload,
} from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";

const createOrderSchema = z.object({
  sender_id: z.string().uuid(),
  receiver_id: z.string().uuid(),
  pickup_address_id: z.string().uuid(),
  delivery_address_id: z.string().uuid(),
  service_type: z.string().default("standard"),
  cod_amount: z.number().nonnegative().default(0),
  total_fee: z.number().nonnegative().default(0),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        item_name: z.string().min(1),
        item_type: z.string().optional(),
        quantity: z.number().int().positive().default(1),
        weight: z.number().optional(),
        length: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        declared_value: z.number().optional(),
        note: z.string().optional(),
      }),
    )
    .min(1),
});

function generateTrackingCode(): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `DH${ymd}${suffix}`;
}

type ServiceSupabaseClient = ReturnType<typeof getSupabaseServiceClient>;

function canViewAllOrders(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.DISPATCHER;
}

function canCreateOrder(roleCode: RoleCode): boolean {
  return canViewAllOrders(roleCode) || roleCode === RoleCode.CUSTOMER;
}

/** Lay ID don ma tai khoan duoc phep xem, khong tra ve toan bo orders. */
async function findVisibleOrderIds(
  supabase: ServiceSupabaseClient,
  auth: AuthTokenPayload,
): Promise<{ ids: string[]; error: string | null }> {
  const ids = new Set<string>();
  const createdByUser = await supabase.from("orders").select("id").eq("created_by", auth.userId);
  if (createdByUser.error) return { ids: [], error: createdByUser.error.message };
  createdByUser.data?.forEach((order) => ids.add(order.id));

  if (auth.roleCode === RoleCode.CUSTOMER) {
    const contacts = await supabase.from("contacts").select("id").eq("user_id", auth.userId);
    if (contacts.error) return { ids: [], error: contacts.error.message };

    const contactIds = (contacts.data ?? []).map((contact) => contact.id);
    if (contactIds.length > 0) {
      const [sentOrders, receivedOrders] = await Promise.all([
        supabase.from("orders").select("id").in("sender_id", contactIds),
        supabase.from("orders").select("id").in("receiver_id", contactIds),
      ]);
      if (sentOrders.error) return { ids: [], error: sentOrders.error.message };
      if (receivedOrders.error) return { ids: [], error: receivedOrders.error.message };
      sentOrders.data?.forEach((order) => ids.add(order.id));
      receivedOrders.data?.forEach((order) => ids.add(order.id));
    }
  }

  if (auth.roleCode === RoleCode.DELIVERY_STAFF) {
    const deliveries = await supabase
      .from("deliveries")
      .select("order_id")
      .eq("delivery_staff_id", auth.userId);
    if (deliveries.error) return { ids: [], error: deliveries.error.message };
    deliveries.data?.forEach((delivery) => ids.add(delivery.order_id));
  }

  return { ids: Array.from(ids), error: null };
}

/** GET /api/orders — danh sach don hang (loc theo status, phan trang). */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");
  const statusCode = searchParams.get("status");

  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from("orders")
    .select(
      "id, tracking_code, qr_code, service_type, cod_amount, total_fee, note, created_at, order_statuses(code, name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (!canViewAllOrders(auth.roleCode)) {
    const visible = await findVisibleOrderIds(supabase, auth);
    if (visible.error) return fail(visible.error, 500);
    if (visible.ids.length === 0) {
      return ok({ items: [], total: 0, page, pageSize });
    }
    query = query.in("id", visible.ids);
  }

  if (statusCode) {
    query = query.eq("order_statuses.code", statusCode);
  }

  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);

  return ok({ items: data, total: count ?? 0, page, pageSize });
}

/** POST /api/orders — tao don hang moi, sinh tracking_code + QR, ghi su kien ORDER_CREATED. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canCreateOrder(auth.roleCode)) return fail("Forbidden", 403);

  const parsed = createOrderSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const supabase = getSupabaseServiceClient();

  const contactIds = Array.from(new Set([parsed.data.sender_id, parsed.data.receiver_id]));
  const { data: contactRows, error: contactsError } = await supabase
    .from("contacts")
    .select("id, user_id, type")
    .in("id", contactIds);
  if (contactsError) return fail(contactsError.message, 500);

  const contactsById = new Map((contactRows ?? []).map((contact) => [contact.id, contact]));
  const sender = contactsById.get(parsed.data.sender_id);
  const receiver = contactsById.get(parsed.data.receiver_id);
  if (!sender || !receiver) return fail("Sender hoặc receiver contact không tồn tại", 404);

  if (!canBeSender(sender.type as ContactType) || !canBeReceiver(receiver.type as ContactType)) {
    return fail("Loại contact không phù hợp với vai trò trong đơn hàng", 400);
  }

  if (auth.roleCode === RoleCode.CUSTOMER) {
    if (sender.user_id !== auth.userId || receiver.user_id !== auth.userId) {
      return fail("Khách hàng chỉ được dùng contact trong sổ địa chỉ của mình", 403);
    }
  }

  const addressIds = Array.from(new Set([parsed.data.pickup_address_id, parsed.data.delivery_address_id]));
  const { data: addressRows, error: addressesError } = await supabase
    .from("addresses")
    .select("id, contact_id")
    .in("id", addressIds);
  if (addressesError) return fail(addressesError.message, 500);

  const addressesById = new Map((addressRows ?? []).map((address) => [address.id, address]));
  const pickupAddress = addressesById.get(parsed.data.pickup_address_id);
  const deliveryAddress = addressesById.get(parsed.data.delivery_address_id);
  if (!pickupAddress || !deliveryAddress) return fail("Địa chỉ giao nhận không tồn tại", 404);
  if (pickupAddress.contact_id !== sender.id || deliveryAddress.contact_id !== receiver.id) {
    return fail("Địa chỉ không thuộc đúng contact trong đơn hàng", 400);
  }

  const { data: createdStatus, error: statusError } = await supabase
    .from("order_statuses")
    .select("id")
    .eq("code", OrderStatusCode.CREATED)
    .single();
  if (statusError || !createdStatus) return fail("Order status seed missing", 500);

  const trackingCode = generateTrackingCode();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      tracking_code: trackingCode,
      qr_code: trackingCode,
      sender_id: parsed.data.sender_id,
      receiver_id: parsed.data.receiver_id,
      pickup_address_id: parsed.data.pickup_address_id,
      delivery_address_id: parsed.data.delivery_address_id,
      service_type: parsed.data.service_type,
      cod_amount: parsed.data.cod_amount,
      total_fee: parsed.data.total_fee,
      note: parsed.data.note ?? null,
      status_id: createdStatus.id,
      created_by: auth.userId,
    })
    .select("id, tracking_code, qr_code")
    .single();

  if (orderError) return fail(orderError.message, 500);

  const items = parsed.data.items.map((item) => ({ ...item, order_id: order.id }));
  const { error: itemsError } = await supabase.from("order_items").insert(items);
  if (itemsError) return fail(itemsError.message, 500);

  // TODO: goi recordDeliveryEventOnChain({ eventType: "ORDER_CREATED", ... })
  // va luu ket qua (transaction_hash, block_number) vao bang blockchain_events.

  return ok(order, 201);
}
