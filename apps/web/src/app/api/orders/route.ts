import type { NextRequest } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Json } from "@delivery/database";
import {
  BlockchainEventType,
  ContactType,
  OrderStatusCode,
  RoleCode,
  canBeReceiver,
  canBeSender,
} from "@delivery/shared";
import { suspendedAreaError } from "@/lib/area-catalog";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { selectNearestWarehouse } from "@/lib/shipment-routing";
import { createAutomaticShipmentRoute } from "@/lib/shipment-route-planner";
import { fetchActiveCommuneWarehouses } from "@/lib/warehouse-queries";
import { queueBlockchainEvent } from "@/lib/blockchain/queue-event";
import { isQrPaymentMethod, shippingFeePayerSchema, shippingPaymentMethodSchema } from "@/lib/shipping-payment";
import { calculateShippingFee, isServiceAvailable } from "@/lib/shipping-fee";
import { zoneForProvinces } from "@/lib/shipping-zone";
import { loadPricingConfig } from "@/lib/shipping-pricing";
import { getVisibleOrderIds } from "@/lib/order-access";
import { getUserOperationalScope, warehouseBelongsToScope } from "@/lib/dispatcher-scope";

const createOrderSchema = z.object({
  sender_id: z.string().uuid(),
  receiver_id: z.string().uuid(),
  receiver_is_sender: z.boolean().default(false),
  pickup_address_id: z.string().uuid(),
  delivery_address_id: z.string().uuid(),
  service_type: z.enum(["standard", "express", "same_day"]).default("standard"),
  cod_amount: z.number().finite().nonnegative().max(999999999999.99).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "COD tối đa hai chữ số thập phân").default(0),
  // Both may be absent for an older browser tab during deployment. Never invent a payer.
  shipping_fee_payer: shippingFeePayerSchema.optional(),
  shipping_payment_method: shippingPaymentMethodSchema.optional(),
  note: z.string().trim().max(1000).optional().transform((value) => value || undefined),
  items: z
    .array(
      z.object({
        item_name: z.string().trim().min(1).max(200),
        item_type: z.string().trim().max(100).optional().transform((value) => value || undefined),
        quantity: z.number().int().positive().max(10000).default(1),
        weight: z.number().finite().positive().max(10000)
          .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "Khối lượng tối đa hai chữ số thập phân")
          .optional(),
        length: z.number().finite().positive().max(1000)
          .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "Kích thước tối đa hai chữ số thập phân")
          .optional(),
        width: z.number().finite().positive().max(1000)
          .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "Kích thước tối đa hai chữ số thập phân")
          .optional(),
        height: z.number().finite().positive().max(1000)
          .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "Kích thước tối đa hai chữ số thập phân")
          .optional(),
        declared_value: z.number().finite().nonnegative().max(999999999999.99)
          .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "Giá trị khai báo tối đa hai chữ số thập phân")
          .optional(),
        note: z.string().trim().max(1000).optional().transform((value) => value || undefined),
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

function dateOnlyBoundary(value: string | null, endExclusive = false): string | null | undefined {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }
  const utcBoundary = Date.UTC(year, month - 1, day + (endExclusive ? 1 : 0));
  return new Date(utcBoundary - 7 * 60 * 60 * 1000).toISOString();
}

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

function canCreateOrder(roleCode: RoleCode): boolean {
  // Don hang do khach hang tu tao, hoac Admin / dieu phoi vien tao ho khach
  // (tiep nhan tai quay). Dieu phoi vien chi tao don co kho lay hang thuoc pham vi cua minh.
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.CUSTOMER || roleCode === RoleCode.DISPATCHER;
}

/** GET /api/orders — danh sach don hang (loc theo status, phan trang). */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const requestedPageSize = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const pageSize =
    Number.isInteger(requestedPageSize) && requestedPageSize > 0
      ? Math.min(requestedPageSize, 100)
      : 20;
  const statusCode = searchParams.get("status");
  const searchTerm = searchParams.get("q")?.trim() || null;
  const fromDate = searchParams.get("from");
  const toDate = searchParams.get("to");
  const createdFrom = dateOnlyBoundary(fromDate);
  const createdBefore = dateOnlyBoundary(toDate, true);
  if (searchTerm && searchTerm.length > 100) return fail("Từ khóa tìm kiếm không được vượt quá 100 ký tự", 400);
  if (createdFrom === undefined || createdBefore === undefined) return fail("Ngày lọc đơn hàng không hợp lệ", 400);
  if (fromDate && toDate && fromDate > toDate) return fail("Khoảng ngày lọc đơn hàng không hợp lệ", 400);
  const validStatusCodes: string[] = Object.values(OrderStatusCode);
  if (statusCode && !validStatusCodes.includes(statusCode)) {
    return fail("Trạng thái đơn hàng không hợp lệ", 400);
  }
  const direction = searchParams.get("direction");
  if (direction && direction !== "sent" && direction !== "received") {
    return fail("direction phải là sent hoặc received");
  }
  const orderDirection = direction === "sent" || direction === "received" ? direction : undefined;

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
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  const visible = await getVisibleOrderIds(supabase, auth, orderDirection);
  if (visible.error) {
    if (visible.status && visible.status < 500) return fail(visible.error, visible.status);
    console.error("Resolving order list access failed", { roleCode: auth.roleCode, error: visible.error });
    return fail("Không thể kiểm tra phạm vi đơn hàng.", 500);
  }
  if (visible.ids) {
    if (visible.ids.length === 0) return ok({ items: [], total: 0, page, pageSize });
  }

  const { data: matchingRows, error: matchingError } = await supabase.rpc("search_orders_page_filtered", {
    p_visible_order_ids: visible.ids,
    p_status_code: statusCode || null,
    p_search: searchTerm,
    p_created_from: createdFrom,
    p_created_before: createdBefore,
    p_page: page,
    p_page_size: pageSize,
  });
  if (matchingError) {
    console.error("Searching order page failed", { code: matchingError.code, message: matchingError.message });
    return fail("Không thể tải danh sách đơn hàng.", 500);
  }
  const total = Number(matchingRows?.[0]?.total_count ?? 0);
  const matchingIds = (matchingRows ?? [])
    .map((row) => row.order_id)
    .filter((id): id is string => id !== null);
  if (matchingIds.length === 0) return ok({ items: [], total, page, pageSize });
  query = query.in("id", matchingIds);

  const { data, error } = await query;
  if (error) {
    console.error("Loading order page details failed", { code: error.code, message: error.message });
    return fail("Không thể tải danh sách đơn hàng.", 500);
  }

  return ok({ items: data, total, page, pageSize });
}

/** POST /api/orders — tao don hang moi, sinh tracking_code + QR, ghi su kien ORDER_CREATED. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canCreateOrder(auth.roleCode)) return fail("Forbidden", 403);

  const parsedIdempotencyKey = z.string().uuid().safeParse(request.headers.get("Idempotency-Key"));
  if (!parsedIdempotencyKey.success) return fail("Thiếu hoặc sai khóa chống tạo đơn trùng", 400);

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return fail("Dữ liệu đơn hàng không hợp lệ", 400);
  }
  const parsed = createOrderSchema.safeParse(requestBody);
  if (!parsed.success) return fail(parsed.error.message);
  if ((parsed.data.shipping_fee_payer === undefined) !== (parsed.data.shipping_payment_method === undefined)) {
    return fail("Cần chọn cả người trả và phương thức thanh toán phí vận chuyển.", 400);
  }
  if (isQrPaymentMethod(parsed.data.shipping_payment_method)) {
    const { data: activeAccount, error: activeAccountError } = await getSupabaseServiceClient()
      .from("payment_accounts").select("id")
      .eq("kind", parsed.data.shipping_payment_method === "vietqr" ? "bank" : "momo").eq("is_active", true).maybeSingle();
    if (activeAccountError) return fail(activeAccountError.message, 500);
    if (!activeAccount) return fail("Chưa cấu hình tài khoản nhận tiền cho phương thức này. Vui lòng chọn tiền mặt hoặc liên hệ quản trị viên.", 409);
  }

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
  if (auth.roleCode === RoleCode.DISPATCHER) {
    if (sender.user_id !== auth.userId || receiver.user_id !== auth.userId) {
      return fail("Điều phối viên chỉ được dùng người gửi/nhận do chính mình nhập khi tạo đơn hộ", 403);
    }
  }
  if (parsed.data.receiver_is_sender && auth.roleCode !== RoleCode.CUSTOMER) {
    return fail("Chỉ khách hàng mới có thể chỉ định mình là người nhận.", 403);
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

  // Khu vực bị tạm dừng trong danh mục khu vực thì không nhận đơn lấy/giao tại đó.
  const suspendedError = await suspendedAreaError([
    { title: "Địa chỉ lấy hàng", province: pickupAddress.province, district: pickupAddress.district, ward: pickupAddress.ward },
    { title: "Địa chỉ giao hàng", province: deliveryAddress.province, district: deliveryAddress.district, ward: deliveryAddress.ward },
  ]);
  if (suspendedError) return fail(suspendedError, 400);

  // Cước phụ thuộc phạm vi tuyến (nội tỉnh/nội vùng/liên vùng), luôn tính lại ở server.
  let routeZoneValue;
  try {
    routeZoneValue = await zoneForProvinces(pickupAddress.province, deliveryAddress.province);
  } catch {
    return fail("Chưa tính được phạm vi tuyến lúc này. Vui lòng thử lại.", 503);
  }
  const pricing = await loadPricingConfig();
  if (!isServiceAvailable(parsed.data.service_type, routeZoneValue, pricing)) {
    return fail("Dịch vụ giao trong ngày chỉ áp dụng nội tỉnh. Hãy chọn dịch vụ khác.", 400);
  }
  const shippingFee = calculateShippingFee(parsed.data.service_type, parsed.data.items, routeZoneValue, pricing, {
    pickup: { province: pickupAddress.province, ward: pickupAddress.ward },
    delivery: { province: deliveryAddress.province, ward: deliveryAddress.ward },
  });

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

  if (auth.roleCode === RoleCode.DISPATCHER) {
    // Đơn chỉ hiện trong hàng chờ của điều phối viên khi kho lấy hàng thuộc phạm vi của họ.
    const dispatcherScope = await getUserOperationalScope(auth);
    if (dispatcherScope.error) return fail(dispatcherScope.error, 500);
    if (!dispatcherScope.warehouseId) return fail("Tài khoản điều phối viên chưa được gán kho phụ trách", 409);
    if (!warehouseBelongsToScope(dispatcherScope, pickupWarehouse)) {
      return fail("Địa chỉ lấy hàng nằm ngoài tỉnh/kho bạn phụ trách. Hãy nhờ điều phối viên của khu vực đó tạo đơn.", 403);
    }
  }

  const { data: createdStatus, error: statusError } = await supabase
    .from("order_statuses")
    .select("id")
    .eq("code", OrderStatusCode.CREATED)
    .single();
  if (statusError || !createdStatus) return fail("Order status seed missing", 500);

  const trackingCode = generateTrackingCode();
  const orderPayload = {
    tracking_code: trackingCode,
    qr_code: trackingCode,
    sender_id: parsed.data.sender_id,
    receiver_id: parsed.data.receiver_id,
    sender_user_id: auth.roleCode === RoleCode.CUSTOMER ? auth.userId : null,
    receiver_user_id: parsed.data.receiver_is_sender ? auth.userId : null,
    pickup_address_id: parsed.data.pickup_address_id,
    delivery_address_id: parsed.data.delivery_address_id,
    pickup_warehouse_id: pickupWarehouse.id,
    delivery_warehouse_id: deliveryWarehouse.id,
    service_type: parsed.data.service_type,
    cod_amount: parsed.data.cod_amount,
    total_fee: shippingFee,
    shipping_fee_payer: parsed.data.shipping_fee_payer ?? null,
    shipping_payment_method: parsed.data.shipping_payment_method ?? null,
    note: parsed.data.note ?? null,
    status_id: createdStatus.id,
    created_by: auth.userId,
  };
  const normalizedRequest = {
    sender_id: parsed.data.sender_id.toLowerCase(),
    receiver_id: parsed.data.receiver_id.toLowerCase(),
    pickup_address_id: parsed.data.pickup_address_id.toLowerCase(),
    delivery_address_id: parsed.data.delivery_address_id.toLowerCase(),
    service_type: parsed.data.service_type,
    cod_amount: parsed.data.cod_amount,
    shipping_fee_payer: parsed.data.shipping_fee_payer ?? null,
    shipping_payment_method: parsed.data.shipping_payment_method ?? null,
    note: parsed.data.note?.trim() || null,
    items: parsed.data.items.map((item) => ({
      item_name: item.item_name.trim(),
      item_type: item.item_type?.trim() || null,
      quantity: item.quantity,
      weight: item.weight ?? null,
      length: item.length ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      declared_value: item.declared_value ?? null,
      note: item.note?.trim() || null,
    })),
    ...(parsed.data.receiver_is_sender ? { receiver_is_sender: true } : {}),
  };
  const requestHash = createHash("sha256").update(JSON.stringify(normalizedRequest)).digest("hex");

  const { data: createdRows, error: createError } = await supabase.rpc("create_order_with_items", {
    p_order: orderPayload as Json,
    p_items: parsed.data.items as Json,
    p_idempotency_key: parsedIdempotencyKey.data,
    p_request_hash: requestHash,
  });
  if (createError) {
    if (createError.message.includes("ORDER_IDEMPOTENCY_KEY_REUSED")) {
      return fail("Khóa tạo đơn này đã được dùng với dữ liệu khác. Hãy kiểm tra danh sách đơn trước khi thử tạo đơn mới.", 409);
    }
    console.error("Atomic order creation failed", { code: createError.code, message: createError.message });
    return fail("Không thể tạo đơn hàng và sản phẩm. Vui lòng thử lại bằng cùng một yêu cầu.", 500);
  }
  const order = createdRows?.[0];
  if (!order) return fail("Database không trả về đơn hàng đã tạo", 500);
  const orderResponse = {
    id: order.id,
    tracking_code: order.tracking_code,
    qr_code: order.qr_code,
    pickup_warehouse_id: order.pickup_warehouse_id,
    delivery_warehouse_id: order.delivery_warehouse_id,
  };

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
      totalFee: shippingFee,
      items: parsed.data.items,
    },
  });

  // Lập tuyến ngay sau khi đơn và hàng hóa được tạo. Nếu dữ liệu mạng kho
  // chưa hoàn chỉnh, vẫn giữ đơn ở trạng thái CREATED để điều phối viên có
  // thể sửa dữ liệu và dùng hàng đợi "đơn chưa phân tuyến" lập bổ sung.
  const routeResult = await createAutomaticShipmentRoute(order.id);
  if (routeResult.error) {
    if (routeResult.alreadyExists) {
      const { count, error: legsError } = await supabase
        .from("shipment_legs")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order.id);
      if (!legsError && (count ?? 0) > 0) {
        return ok({ ...orderResponse, route_status: "AUTO_PLANNED", route_strategy: null }, 201);
      }
      if (legsError) {
        console.error("Could not verify existing shipment route", { orderId: order.id, error: legsError.message });
      }
    }
    console.error("Automatic shipment route planning failed", {
      orderId: order.id,
      error: routeResult.error,
    });
    return ok({
      ...orderResponse,
      route_status: "PENDING_REPAIR",
      route_warning: routeResult.error,
    }, 201);
  }

  return ok({
    ...orderResponse,
    route_status: "AUTO_PLANNED",
    route_strategy: routeResult.data?.strategy ?? null,
  }, 201);
}
