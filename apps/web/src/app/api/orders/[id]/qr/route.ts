import type { NextRequest } from "next/server";
import { RoleCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { generateOrderQrCode } from "@/lib/qr";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";

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
      "tracking_code, created_by, sender:contacts!orders_sender_id_fkey(user_id), receiver:contacts!orders_receiver_id_fkey(user_id)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!order) return fail("Order not found", 404);

  const canViewAll = auth.roleCode === RoleCode.ADMIN || auth.roleCode === RoleCode.DISPATCHER;
  const sender = Array.isArray(order.sender) ? order.sender[0] : order.sender;
  const receiver = Array.isArray(order.receiver) ? order.receiver[0] : order.receiver;
  const canView =
    canViewAll ||
    order.created_by === auth.userId ||
    sender?.user_id === auth.userId ||
    receiver?.user_id === auth.userId;
  if (!canView) return fail("Forbidden", 403);

  const qrDataUrl = await generateOrderQrCode(order.tracking_code);
  return ok({ trackingCode: order.tracking_code, qrDataUrl });
}
