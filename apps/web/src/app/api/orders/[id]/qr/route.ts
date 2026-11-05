import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { generateOrderQrCode } from "@/lib/qr";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";
import { checkOrderViewAccess } from "@/lib/order-access";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/orders/:id/qr — tra ve anh QR (data URL) cua don hang de in/hien thi. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const parsedOrderId = z.string().uuid().safeParse((await params).id);
  if (!parsedOrderId.success) return fail("Mã đơn hàng không hợp lệ.", 400);
  const orderId = parsedOrderId.data.toLowerCase();
  const supabase = getSupabaseServiceClient();

  const access = await checkOrderViewAccess(supabase, auth, orderId);
  if (!access.allowed) {
    if (access.status >= 500) {
      console.error("Checking order QR access failed", { orderId, error: access.error });
      return fail("Không thể kiểm tra quyền truy cập mã QR.", 500);
    }
    return fail(access.error, access.status);
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("tracking_code, public_tracking_token")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("Loading order tracking code for QR failed", { orderId, error });
    return fail("Không thể tải mã vận đơn để tạo QR.", 500);
  }
  if (!order) return fail("Order not found", 404);

  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredAppUrl) return fail("Chưa cấu hình địa chỉ ứng dụng để tạo QR tracking.", 503);

  let appOrigin: string;
  try {
    const appUrl = new URL(configuredAppUrl);
    if (
      !["http:", "https:"].includes(appUrl.protocol)
      || appUrl.username
      || appUrl.password
      || (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:")
    ) {
      return fail("Địa chỉ ứng dụng dùng để tạo QR tracking không hợp lệ.", 503);
    }
    appOrigin = appUrl.origin;
  } catch {
    return fail("Địa chỉ ứng dụng dùng để tạo QR tracking không hợp lệ.", 503);
  }

  const trackingUrl = new URL(`/tra-cuu/${encodeURIComponent(order.public_tracking_token)}`, appOrigin).toString();
  let qrDataUrl: string;
  try {
    qrDataUrl = await generateOrderQrCode(trackingUrl);
  } catch (qrError) {
    console.error("Generating order QR failed", { orderId, qrError });
    return fail("Không thể tạo mã QR cho đơn hàng.", 500);
  }
  return ok({ trackingCode: order.tracking_code, qrDataUrl });
}
