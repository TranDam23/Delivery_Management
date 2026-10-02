import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { BlockchainEventType } from "@delivery/shared";
import type { Json } from "@delivery/database";
import { fail, ok } from "@/lib/api-response";
import { queueBlockchainEvent } from "@/lib/blockchain/queue-event";
import { guestOrderSchema } from "@/lib/guest-order-schema";
import { calculateShippingFee, isServiceAvailable } from "@/lib/shipping-fee";
import { zoneForProvinces } from "@/lib/shipping-zone";
import { verifyGuestEmailOtp } from "@/lib/guest-email-otp";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";
import { createAutomaticShipmentRoute } from "@/lib/shipment-route-planner";
import { normalizeArea, selectNearestWarehouse } from "@/lib/shipment-routing";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { fetchActiveCommuneWarehouses } from "@/lib/warehouse-queries";

interface Warehouse {
  id: string; code: string; name: string; province: string;
  district: string | null; ward: string | null;
  latitude: number | null; longitude: number | null;
}

export async function POST(request: NextRequest) {
  const slot = await takePublicLookupSlot(request, { scope: "guest-create", limit: 10, windowSeconds: 600 });
  if (slot === "unavailable") return fail("Dịch vụ tạo đơn tạm thời chưa sẵn sàng.", 503);
  if (slot === "limited") return fail("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.", 429);

  const parsed = guestOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Thông tin đơn hàng không hợp lệ.");
  const input = parsed.data;
  if ((input.shippingFeePayer === undefined) !== (input.shippingPaymentMethod === undefined)) {
    return fail("Cần chọn cả người trả và phương thức thanh toán phí vận chuyển.", 400);
  }
  if (input.shippingPaymentMethod !== undefined && input.shippingPaymentMethod !== "cash") {
    return fail("VietQR và MoMo chưa có tài khoản nhận tiền/callback xác thực; hiện chỉ có thể chọn tiền mặt.", 503);
  }
  const { data: warehouses, error: warehousesError } = await fetchActiveCommuneWarehouses<Warehouse>(
    "id, code, name, province, district, ward, latitude, longitude",
  );
  if (warehousesError) return fail("Không tải được dữ liệu kho.", 503);

  function validLocation(address: typeof input.sender): boolean {
    return warehouses.some((warehouse) =>
      normalizeArea(warehouse.province) === normalizeArea(address.province)
      && normalizeArea(warehouse.ward) === normalizeArea(address.ward)
      && (!address.district || !warehouse.district || normalizeArea(warehouse.district) === normalizeArea(address.district)));
  }
  if (!validLocation(input.sender) || !validLocation(input.receiver)) {
    return fail("Địa chỉ gửi/nhận không khớp tỉnh, quận/huyện và xã/phường trong mạng kho. Vui lòng chọn lại.");
  }

  const pickup = selectNearestWarehouse(input.sender, warehouses);
  const delivery = selectNearestWarehouse(input.receiver, warehouses);
  if (!pickup || !delivery) return fail("Chưa có kho hoạt động phục vụ địa chỉ gửi hoặc nhận.");

  let zone;
  try { zone = await zoneForProvinces(input.sender.province, input.receiver.province); }
  catch { return fail("Chưa tính được phạm vi tuyến lúc này.", 503); }
  if (!isServiceAvailable(input.serviceType, zone)) return fail("Dịch vụ giao trong ngày chỉ áp dụng nội tỉnh. Hãy chọn dịch vụ khác.");

  let verified: { userId: string } | null;
  try { verified = await verifyGuestEmailOtp(input.email, input.otp); }
  catch { return fail("Dịch vụ xác thực email chưa sẵn sàng.", 503); }
  if (!verified) return fail("Mã OTP không đúng hoặc đã hết hạn.", 401);

  const trackingCode = `DH${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const payload = {
    email: input.email,
    sender: input.sender,
    receiver: input.receiver,
    serviceType: input.serviceType,
    shippingFeePayer: input.shippingFeePayer,
    shippingPaymentMethod: input.shippingPaymentMethod,
    codAmount: input.codAmount,
    note: input.note,
    item: input.item,
    trackingCode,
    pickupWarehouseId: pickup.id,
    deliveryWarehouseId: delivery.id,
    totalFee: calculateShippingFee(input.serviceType, [{ weight: input.item.weight ?? undefined, quantity: input.item.quantity }], zone),
    verifiedAuthUserId: verified.userId,
  };
  const { data, error } = await getSupabaseServiceClient().rpc("create_guest_order", { p_payload: payload as Json });
  if (error || !data?.[0]) {
    console.error("Guest order creation failed", { code: error?.code, message: error?.message });
    return fail("Chưa tạo được đơn hàng. Vui lòng liên hệ hỗ trợ và không gửi lại trước khi kiểm tra mã đơn.", 503);
  }
  const order = data[0];
  await queueBlockchainEvent({
    orderId: order.order_id, trackingCode, eventType: BlockchainEventType.ORDER_CREATED,
    performedBy: order.actor_id,
    payload: { guest: true, pickupWarehouseId: pickup.id, deliveryWarehouseId: delivery.id },
  });
  const route = await createAutomaticShipmentRoute(order.order_id);
  if (route.error) console.error("Guest order route pending repair", { orderId: order.order_id, error: route.error });
  return ok({ trackingCode, routeStatus: route.error ? "PENDING_REPAIR" : "AUTO_PLANNED" }, 201);
}
