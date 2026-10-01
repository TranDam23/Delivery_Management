import type { NextRequest } from "next/server";
import { OrderStatusCode } from "@delivery/shared";
import { z } from "zod";
import { fail, ok } from "@/lib/api-response";
import { verifyGuestEmailOtp } from "@/lib/guest-email-otp";
import { guestEmailSchema } from "@/lib/guest-order-schema";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  trackingCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{8,40}$/),
  email: guestEmailSchema,
  otp: z.string().trim().regex(/^\d{6,8}$/),
  kind: z.enum(["REVIEW", "COMPLAINT"]),
  rating: z.number().int().min(1).max(5).nullable(),
  message: z.string().trim().min(10).max(2000),
}).superRefine((value, context) => {
  if ((value.kind === "REVIEW") !== (value.rating !== null)) {
    context.addIssue({ code: "custom", path: ["rating"], message: "Đánh giá cần chọn từ 1 đến 5 sao; phản ánh không dùng số sao." });
  }
});

/** Public recipient feedback; a tracking code or phone alone grants no write access. */
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Thông tin phản hồi không hợp lệ.");
  const input = parsed.data;
  const slot = await takePublicLookupSlot(request, {
    scope: "recipient-feedback", limit: 5, windowSeconds: 600, subject: input.email,
  });
  if (slot === "unavailable") return fail("Dịch vụ phản hồi tạm thời chưa sẵn sàng.", 503);
  if (slot === "limited") return fail("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.", 429);

  let verified: { userId: string } | null;
  try { verified = await verifyGuestEmailOtp(input.email, input.otp); }
  catch { return fail("Dịch vụ xác thực email chưa sẵn sàng.", 503); }
  if (!verified) return fail("Mã OTP không đúng hoặc đã hết hạn.", 401);

  const db = getSupabaseServiceClient();
  const { data: order, error: orderError } = await db.from("orders")
    .select("id, order_statuses(code)")
    .eq("tracking_code", input.trackingCode)
    .maybeSingle();
  if (orderError) return fail("Không thể kiểm tra đơn hàng lúc này.", 503);
  if (!order) return fail("Không thể xác minh đơn hàng và email người nhận.", 404);

  const { data: recipient, error: recipientError } = await db.from("order_feedback_recipients")
    .select("recipient_email")
    .eq("order_id", order.id)
    .maybeSingle();
  if (recipientError) return fail("Không thể kiểm tra email người nhận lúc này.", 503);
  if (recipient?.recipient_email !== input.email) {
    return fail("Không thể xác minh đơn hàng và email người nhận.", 403);
  }
  const orderStatus = Array.isArray(order.order_statuses) ? order.order_statuses[0] : order.order_statuses;
  if (orderStatus?.code !== OrderStatusCode.DELIVERED) {
    return fail("Chỉ có thể đánh giá hoặc phản ánh sau khi shipper hoàn tất giao hàng.", 409);
  }

  const { data: feedback, error } = await db.from("order_feedback")
    .insert({
      order_id: order.id,
      kind: input.kind,
      rating: input.rating,
      message: input.message,
      verified_auth_user_id: verified.userId,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return fail("Bạn đã gửi loại phản hồi này cho đơn hàng.", 409);
  if (error || !feedback) return fail("Chưa lưu được phản hồi. Vui lòng thử lại sau.", 503);
  return ok({ id: feedback.id, message: input.kind === "COMPLAINT"
    ? "Phản ánh đã được chuyển tới bộ phận điều phối để xử lý."
    : "Cảm ơn bạn đã đánh giá đơn hàng." }, 201);
}
