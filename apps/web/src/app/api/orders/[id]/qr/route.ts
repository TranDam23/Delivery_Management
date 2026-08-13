import type { NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { generateOrderQrCode } from "@/lib/qr";
import { ok, fail } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/orders/:id/qr — tra ve anh QR (data URL) cua don hang de in/hien thi. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("tracking_code")
    .eq("id", id)
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!order) return fail("Order not found", 404);

  const qrDataUrl = await generateOrderQrCode(order.tracking_code);
  return ok({ trackingCode: order.tracking_code, qrDataUrl });
}
