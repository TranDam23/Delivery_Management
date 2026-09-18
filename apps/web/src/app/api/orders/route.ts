import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  BlockchainEventType,
  ContactType,
  OrderStatusCode,
  RoleCode,
  WarehouseLevelCode,
  WarehouseStatusCode,
  canBeReceiver,
  canBeSender,
  normalizePhone,
  type AuthTokenPayload,
} from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import {
  getUserOperationalScope,
  type OperationalWarehouseScope,
} from "@/lib/dispatcher-scope";
import { selectNearestWarehouse } from "@/lib/shipment-routing";
import { createAutomaticShipmentRoute } from "@/lib/shipment-route-planner";
import { fetchActiveCommuneWarehouses } from "@/lib/warehouse-queries";
import { queueBlockchainEvent } from "@/lib/blockchain/queue-event";

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

interface OrderWarehouseCandidate {
  id: string;
  code: string;
  name: string;
  ward: string | null;
  district: string | null;
  province: string;
  warehouse_level?: string;
  latitude?: number | null;
  longitude?: number | null;
}

function canViewAllOrders(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.DISPATCHER;
}

function canCreateOrder(roleCode: RoleCode): boolean {
  // Don hang do khach hang tao (hoac admin tao ho cho nghiep vu noi bo).
  // Dieu phoi vien chi tiep nhan va dieu phoi don da duoc tao.
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.CUSTOMER;
}

/**
 * Lay cac contact co cung so dien thoai voi tai khoan dang dang nhap.
 *
 * user_id tren contact chi phan anh so dia chi cua nguoi da tao contact. No
 * khong phai la tai khoan cua nguoi se nhan hang, vi vay luong gui/nhan phai
 * doi chieu qua phone de tai khoan nguoi nhan cung thay duoc don.
 */
async function findCustomerContactIds(
  supabase: ServiceSupabaseClient,
  userId: string,
): Promise<{ ids: string[]; error: string | null }> {
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("phone")
    .eq("id", userId)
    .maybeSingle();
  if (userError) return { ids: [], error: userError.message };

  const phone = typeof user?.phone === "string" ? normalizePhone(user.phone) : "";
  const contactQuery = supabase.from("contacts").select("id");
  const { data: contacts, error: contactsError } = phone
    ? await contactQuery.eq("phone", phone)
    : await contactQuery.eq("user_id", userId);

  if (contactsError) return { ids: [], error: contactsError.message };
  return { ids: (contacts ?? []).map((contact) => contact.id), error: null };
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
    const customerContacts = await findCustomerContactIds(supabase, auth.userId);
    if (customerContacts.error) return { ids: [], error: customerContacts.error };

    const contactIds = customerContacts.ids;
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

/** Lấy các đơn đã được gán vào kho đầu lấy hoặc kho đầu giao của điều phối viên. */
async function findWarehouseOrderIds(
  supabase: ServiceSupabaseClient,
  scope: OperationalWarehouseScope,
): Promise<{ ids: string[]; error: string | null }> {
  let warehouseIds = scope.warehouseId ? [scope.warehouseId] : [];
  if (scope.warehouseLevel === WarehouseLevelCode.PROVINCE && scope.province) {
    const { data: provinceWarehouses, error: provinceWarehousesError } = await supabase
      .from("warehouses")
      .select("id")
      .eq("province", scope.province)
      .eq("status", WarehouseStatusCode.ACTIVE);
    if (provinceWarehousesError) return { ids: [], error: provinceWarehousesError.message };
    warehouseIds = (provinceWarehouses ?? []).map((warehouse) => warehouse.id);
  }
  if (warehouseIds.length === 0) return { ids: [], error: null };

  const [pickupOrders, deliveryOrders] = await Promise.all([
    supabase.from("orders").select("id").in("pickup_warehouse_id", warehouseIds),
    supabase.from("orders").select("id").in("delivery_warehouse_id", warehouseIds),
  ]);
  if (pickupOrders.error) return { ids: [], error: pickupOrders.error.message };
  if (deliveryOrders.error) return { ids: [], error: deliveryOrders.error.message };

  return {
    ids: Array.from(new Set([
      ...(pickupOrders.data ?? []).map((order) => order.id),
      ...(deliveryOrders.data ?? []).map((order) => order.id),
    ])),
    error: null,
  };
}

/** GET /api/orders — danh sach don hang (loc theo status, phan trang). */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const requestedPageSize = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize =
    Number.isInteger(requestedPageSize) && requestedPageSize > 0
      ? Math.min(requestedPageSize, 100)
      : 20;
  const statusCode = searchParams.get("status");
  const direction = searchParams.get("direction");
  if (direction && direction !== "sent" && direction !== "received") {
    return fail("direction phải là sent hoặc received");
  }

  const supabase = getSupabaseServiceClient();
  let query = supabase
    .from("orders")
    .select(
      `id, tracking_code, qr_code, sender_id, receiver_id, service_type, cod_amount, total_fee,
       note, created_at, pickup_warehouse_id, delivery_warehouse_id,
       order_statuses!inner(code, name, is_final),
       pickup_warehouse:warehouses!orders_pickup_warehouse_id_fkey(id, code, name, ward, district, province, warehouse_level),
       delivery_warehouse:warehouses!orders_delivery_warehouse_id_fkey(id, code, name, ward, district, province, warehouse_level),
       sender:contacts!orders_sender_id_fkey(id, name, phone),
       receiver:contacts!orders_receiver_id_fkey(id, name, phone),
       pickup_address:addresses!orders_pickup_address_id_fkey(id, recipient_name, phone, address_line, ward, district, province),
       delivery_address:addresses!orders_delivery_address_id_fkey(id, recipient_name, phone, address_line, ward, district, province)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (auth.roleCode === RoleCode.CUSTOMER && direction) {
    const customerContacts = await findCustomerContactIds(supabase, auth.userId);
    if (customerContacts.error) return fail(customerContacts.error, 500);

    const contactIds = customerContacts.ids;
    if (contactIds.length === 0) {
      return ok({ items: [], total: 0, page, pageSize });
    }

    query = query.in(direction === "sent" ? "sender_id" : "receiver_id", contactIds);
  } else if (auth.roleCode === RoleCode.DISPATCHER) {
    const warehouseScope = await getUserOperationalScope(auth);
    if (warehouseScope.error) return fail(warehouseScope.error, 500);
    if (!warehouseScope.warehouseId) return ok({ items: [], total: 0, page, pageSize });

    const visible = await findWarehouseOrderIds(supabase, warehouseScope);
    if (visible.error) return fail(visible.error, 500);
    if (visible.ids.length === 0) {
      return ok({ items: [], total: 0, page, pageSize });
    }
    query = query.in("id", visible.ids);
  } else if (!canViewAllOrders(auth.roleCode)) {
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
    .select("id, contact_id, ward, district, province, latitude, longitude")
    .in("id", addressIds);
  if (addressesError) return fail(addressesError.message, 500);

  const addressesById = new Map((addressRows ?? []).map((address) => [address.id, address]));
  const pickupAddress = addressesById.get(parsed.data.pickup_address_id);
  const deliveryAddress = addressesById.get(parsed.data.delivery_address_id);
  if (!pickupAddress || !deliveryAddress) return fail("Địa chỉ giao nhận không tồn tại", 404);
  if (pickupAddress.contact_id !== sender.id || deliveryAddress.contact_id !== receiver.id) {
    return fail("Địa chỉ không thuộc đúng contact trong đơn hàng", 400);
  }
  if (!pickupAddress.ward?.trim() || !pickupAddress.province?.trim()) {
    return fail("Địa chỉ lấy hàng phải có xã/phường và tỉnh/thành phố", 400);
  }
  if (!deliveryAddress.ward?.trim() || !deliveryAddress.province?.trim()) {
    return fail("Địa chỉ giao hàng phải có xã/phường và tỉnh/thành phố", 400);
  }

  // Gán kho con ngay lúc tạo đơn để điều phối viên nhận được đơn trong hàng
  // chờ của kho lấy hàng. Hàm chọn kho ưu tiên cùng xã/phường + quận/huyện,
  // sau đó fallback trong cùng tỉnh nếu dữ liệu kho chưa đầy đủ.
  const { data: warehouseCandidates, error: warehousesError } = await fetchActiveCommuneWarehouses<OrderWarehouseCandidate>(
    "id, code, name, ward, district, province, warehouse_level, latitude, longitude",
  );
  if (warehousesError) return fail(warehousesError, 500);

  const pickupWarehouse = selectNearestWarehouse(pickupAddress, warehouseCandidates);
  const deliveryWarehouse = selectNearestWarehouse(deliveryAddress, warehouseCandidates);
  if (!pickupWarehouse) {
    return fail("Chưa có kho con hoạt động gần địa chỉ lấy hàng. Hãy chọn xã/phường khác hoặc liên hệ điều phối viên.", 400);
  }
  if (!deliveryWarehouse) {
    return fail("Chưa có kho con hoạt động gần địa chỉ giao hàng. Hãy chọn xã/phường khác hoặc liên hệ điều phối viên.", 400);
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
      pickup_warehouse_id: pickupWarehouse.id,
      delivery_warehouse_id: deliveryWarehouse.id,
      service_type: parsed.data.service_type,
      cod_amount: parsed.data.cod_amount,
      total_fee: parsed.data.total_fee,
      note: parsed.data.note ?? null,
      status_id: createdStatus.id,
      created_by: auth.userId,
    })
    .select("id, tracking_code, qr_code, pickup_warehouse_id, delivery_warehouse_id")
    .single();

  if (orderError) return fail(orderError.message, 500);

  const items = parsed.data.items.map((item) => ({ ...item, order_id: order.id }));
  const { error: itemsError } = await supabase.from("order_items").insert(items);
  if (itemsError) return fail(itemsError.message, 500);

  await queueBlockchainEvent({
    orderId: order.id,
    trackingCode: order.tracking_code,
    eventType: BlockchainEventType.ORDER_CREATED,
    performedBy: auth.userId,
    payload: {
      senderId: parsed.data.sender_id,
      receiverId: parsed.data.receiver_id,
      pickupAddressId: parsed.data.pickup_address_id,
      deliveryAddressId: parsed.data.delivery_address_id,
      serviceType: parsed.data.service_type,
      codAmount: parsed.data.cod_amount,
      totalFee: parsed.data.total_fee,
      items: parsed.data.items,
    },
  });

  // Lập tuyến ngay sau khi đơn và hàng hóa được tạo. Nếu dữ liệu mạng kho
  // chưa hoàn chỉnh, vẫn giữ đơn ở trạng thái CREATED để điều phối viên có
  // thể sửa dữ liệu và dùng hàng đợi "đơn chưa phân tuyến" lập bổ sung.
  const routeResult = await createAutomaticShipmentRoute(order.id);
  if (routeResult.error) {
    console.error("Automatic shipment route planning failed", {
      orderId: order.id,
      error: routeResult.error,
    });
    return ok({
      ...order,
      route_status: "PENDING_REPAIR",
      route_warning: routeResult.error,
    }, 201);
  }

  return ok({
    ...order,
    route_status: "AUTO_PLANNED",
    route_strategy: routeResult.data?.strategy ?? null,
  }, 201);
}
