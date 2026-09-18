import type { NextRequest } from "next/server";
import { normalizePhone, RoleCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { generateOrderQrCode } from "@/lib/qr";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { getUserOperationalScope } from "@/lib/dispatcher-scope";
import { normalizeArea } from "@/lib/shipment-routing";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/orders/:id/qr — tra ve anh QR (data URL) cua don hang de in/hien thi. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "tracking_code, created_by, pickup_warehouse_id, delivery_warehouse_id, pickup_address:addresses!orders_pickup_address_id_fkey(province), delivery_address:addresses!orders_delivery_address_id_fkey(province), sender:contacts!orders_sender_id_fkey(user_id, phone), receiver:contacts!orders_receiver_id_fkey(user_id, phone)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!order) return fail("Order not found", 404);

  const canViewAll = auth.roleCode === RoleCode.ADMIN;
  const sender = Array.isArray(order.sender) ? order.sender[0] : order.sender;
  const receiver = Array.isArray(order.receiver) ? order.receiver[0] : order.receiver;
  const { data: viewer, error: viewerError } = await supabase
    .from("users")
    .select("phone, warehouse_id")
    .eq("id", auth.userId)
    .maybeSingle();
  if (viewerError) return fail(viewerError.message, 500);
  if (!viewer) return fail("Unauthorized", 401);

  const viewerPhone = typeof viewer.phone === "string" ? normalizePhone(viewer.phone) : "";
  let canViewByWarehouse = false;
  if (auth.roleCode === RoleCode.DISPATCHER || auth.roleCode === RoleCode.WAREHOUSE_STAFF) {
    const warehouseScope = await getUserOperationalScope(auth);
    if (warehouseScope.error) return fail(warehouseScope.error, 500);
    canViewByWarehouse = Boolean(
      warehouseScope.warehouseId
      && (auth.roleCode === RoleCode.DISPATCHER && warehouseScope.warehouseLevel === "PROVINCE"
        ? normalizeArea(order.pickup_address?.province) === normalizeArea(warehouseScope.province)
          || normalizeArea(order.delivery_address?.province) === normalizeArea(warehouseScope.province)
        : order.pickup_warehouse_id === warehouseScope.warehouseId
          || order.delivery_warehouse_id === warehouseScope.warehouseId),
    );
  }

  const canView =
    canViewAll ||
    canViewByWarehouse ||
    order.created_by === auth.userId ||
    sender?.user_id === auth.userId ||
    receiver?.user_id === auth.userId ||
    (viewerPhone.length > 0 &&
      (normalizePhone(sender?.phone ?? "") === viewerPhone ||
        normalizePhone(receiver?.phone ?? "") === viewerPhone));
  if (!canView) return fail("Forbidden", 403);

  const qrDataUrl = await generateOrderQrCode(order.tracking_code);
  return ok({ trackingCode: order.tracking_code, qrDataUrl });
}
