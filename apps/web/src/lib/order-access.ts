import { normalizePhone, RoleCode, type AuthTokenPayload } from "@delivery/shared";
import type { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getUserOperationalScope } from "@/lib/dispatcher-scope";
import { normalizeArea } from "@/lib/shipment-routing";

type ServiceClient = ReturnType<typeof getSupabaseServiceClient>;

type OrderAccessRow = {
  id: string;
  created_by: string;
  sender: { user_id: string | null; phone: string } | null;
  receiver: { user_id: string | null; phone: string } | null;
  pickup_warehouse_id: string | null;
  delivery_warehouse_id: string | null;
  pickup_address: { province: string | null } | null;
  delivery_address: { province: string | null } | null;
};

export type OrderViewAccess =
  | { allowed: true; canConfirmReceipt: boolean; isCustomerParticipant: boolean }
  | { allowed: false; error: string; status: number };

function canViewAllOrders(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN || roleCode === RoleCode.DISPATCHER;
}

/**
 * Kiểm tra tài khoản có được xem một đơn hàng không.
 *
 * API dùng service role nên mọi route đọc đơn phải qua hàm này: khách hàng chỉ
 * xem đơn mình tạo hoặc là người gửi/nhận (theo user_id hoặc số điện thoại);
 * điều phối viên và nhân viên kho bị giới hạn theo kho/tỉnh phụ trách; shipper
 * chỉ xem đơn từng được phân công.
 */
export async function checkOrderViewAccess(
  supabase: ServiceClient,
  auth: AuthTokenPayload,
  orderId: string,
): Promise<OrderViewAccess> {
  const { data: accessRaw, error: accessError } = await supabase
    .from("orders")
    .select(
      "id, created_by, pickup_warehouse_id, delivery_warehouse_id, sender:contacts!orders_sender_id_fkey(user_id, phone), receiver:contacts!orders_receiver_id_fkey(user_id, phone), pickup_address:addresses!orders_pickup_address_id_fkey(province), delivery_address:addresses!orders_delivery_address_id_fkey(province)",
    )
    .eq("id", orderId)
    .maybeSingle();
  const access = accessRaw as OrderAccessRow | null;
  if (accessError) return { allowed: false, error: accessError.message, status: 500 };
  if (!access) return { allowed: false, error: "Order not found", status: 404 };

  const { data: viewer, error: viewerError } = await supabase
    .from("users")
    .select("phone, warehouse_id")
    .eq("id", auth.userId)
    .maybeSingle();
  if (viewerError) return { allowed: false, error: viewerError.message, status: 500 };
  if (!viewer) return { allowed: false, error: "Unauthorized", status: 401 };

  if (auth.roleCode === RoleCode.DISPATCHER || auth.roleCode === RoleCode.WAREHOUSE_STAFF) {
    const warehouseScope = await getUserOperationalScope(auth);
    if (warehouseScope.error) return { allowed: false, error: warehouseScope.error, status: 500 };
    if (!warehouseScope.warehouseId) return { allowed: false, error: "Tài khoản chưa được gán kho phụ trách", status: 409 };
    const canViewByWarehouse = auth.roleCode === RoleCode.DISPATCHER
      && warehouseScope.warehouseLevel === "PROVINCE"
      ? normalizeArea(access.pickup_address?.province) === normalizeArea(warehouseScope.province)
        || normalizeArea(access.delivery_address?.province) === normalizeArea(warehouseScope.province)
      : access.pickup_warehouse_id === warehouseScope.warehouseId
        || access.delivery_warehouse_id === warehouseScope.warehouseId;
    if (!canViewByWarehouse) return { allowed: false, error: "Đơn hàng không thuộc kho phụ trách của bạn", status: 403 };
  }

  const viewerPhone = typeof viewer.phone === "string" ? normalizePhone(viewer.phone) : "";
  const isPhoneParticipant =
    viewerPhone.length > 0 &&
    (normalizePhone(access.sender?.phone ?? "") === viewerPhone ||
      normalizePhone(access.receiver?.phone ?? "") === viewerPhone);

  const isCustomerParticipant =
    access.created_by === auth.userId ||
    access.sender?.user_id === auth.userId ||
    access.receiver?.user_id === auth.userId ||
    isPhoneParticipant;
  const canConfirmReceipt = auth.roleCode === RoleCode.ADMIN || (
    auth.roleCode === RoleCode.CUSTOMER && (
      access.receiver?.user_id === auth.userId ||
      (viewerPhone.length > 0 && normalizePhone(access.receiver?.phone ?? "") === viewerPhone)
    )
  );

  let isAssignedDeliveryStaff = false;
  if (auth.roleCode === RoleCode.DELIVERY_STAFF) {
    const { data: delivery, error: deliveryError } = await supabase
      .from("deliveries")
      .select("id")
      .eq("order_id", orderId)
      .eq("delivery_staff_id", auth.userId)
      .limit(1)
      .maybeSingle();
    if (deliveryError) return { allowed: false, error: deliveryError.message, status: 500 };
    isAssignedDeliveryStaff = Boolean(delivery);
  }

  if (!canViewAllOrders(auth.roleCode) && !isCustomerParticipant && !isAssignedDeliveryStaff) {
    return { allowed: false, error: "Forbidden", status: 403 };
  }
  return { allowed: true, canConfirmReceipt, isCustomerParticipant };
}
