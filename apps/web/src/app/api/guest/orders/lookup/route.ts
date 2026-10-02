import type { NextRequest } from "next/server";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { fail, ok } from "@/lib/api-response";
import { guestLookupSchema } from "@/lib/guest-order-schema";
import { verifyGuestEmailOtp } from "@/lib/guest-email-otp";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const slot = await takePublicLookupSlot(request, { scope: "guest-lookup", limit: 10, windowSeconds: 600 });
  if (slot === "unavailable") return fail("Dịch vụ tra cứu tạm thời chưa sẵn sàng.", 503);
  if (slot === "limited") return fail("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.", 429);
  const parsed = guestLookupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Email, OTP hoặc số điện thoại lọc đơn không hợp lệ.");

  const secret = process.env.JWT_SECRET;
  if (!secret) return fail("Dịch vụ tra cứu tạm thời chưa sẵn sàng.", 503);

  let userId: string;
  let lookupToken: string;
  if (parsed.data.lookupToken) {
    try {
      const claims = jwt.verify(parsed.data.lookupToken, secret, { algorithms: ["HS256"] }) as JwtPayload;
      if (claims.purpose !== "guest-order-lookup" || claims.email !== parsed.data.email || typeof claims.userId !== "string") {
        return fail("Phiên tra cứu không hợp lệ. Vui lòng xác thực lại email.", 401);
      }
      userId = claims.userId;
      lookupToken = parsed.data.lookupToken;
    } catch { return fail("Phiên tra cứu đã hết hạn. Vui lòng xác thực lại email.", 401); }
  } else {
    let verified: { userId: string } | null;
    try { verified = await verifyGuestEmailOtp(parsed.data.email, parsed.data.otp ?? ""); }
    catch { return fail("Dịch vụ xác thực email chưa sẵn sàng.", 503); }
    if (!verified) return fail("Mã OTP không đúng hoặc đã hết hạn.", 401);
    userId = verified.userId;
    lookupToken = jwt.sign({ purpose: "guest-order-lookup", email: parsed.data.email, userId }, secret, { expiresIn: "10m" });
  }

  const supabase = getSupabaseServiceClient();
  let query = supabase.from("guest_orders")
    .select("order_id", { count: "exact" })
    .eq("sender_email", parsed.data.email)
    .eq("verified_auth_user_id", userId);
  if (parsed.data.phone) query = query.eq("sender_phone", parsed.data.phone);
  const pageSize = 20;
  const from = (parsed.data.page - 1) * pageSize;
  const { data: matches, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) return fail("Không tra được đơn hàng lúc này.", 503);
  const ids = (matches ?? []).map((row) => row.order_id);
  if (ids.length === 0) return ok({ items: [], total: count ?? 0, page: parsed.data.page, pageSize, lookupToken });
  const { data: orders, error: ordersError } = await supabase.from("orders")
    .select("id, tracking_code, created_at, cod_amount, total_fee, shipping_fee_payer, shipping_payment_method, shipping_payment_status")
    .in("id", ids);
  if (ordersError) return fail("Không tra được đơn hàng lúc này.", 503);
  const { data: codRows, error: codError } = await supabase.from("cod_transactions")
    .select("order_id, status").in("order_id", ids);
  if (codError) return fail("Không tra được trạng thái COD lúc này.", 503);
  const codByOrder = new Map((codRows ?? []).map((row) => [row.order_id, row.status]));
  const byId = new Map((orders ?? []).map((order) => [order.id, order]));
  return ok({ items: ids.flatMap((id) => {
    const order = byId.get(id);
    return order ? [{ tracking_code: order.tracking_code, created_at: order.created_at, cod_amount: Number(order.cod_amount), cod_status: codByOrder.get(id) ?? "pending", total_fee: Number(order.total_fee), shipping_fee_payer: order.shipping_fee_payer, shipping_payment_method: order.shipping_payment_method, shipping_payment_status: order.shipping_payment_status }] : [];
  }), total: count ?? 0, page: parsed.data.page, pageSize, lookupToken });
}
