import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api-response";
import { sendGuestEmailOtp } from "@/lib/guest-email-otp";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Vui lòng nhập email hợp lệ.");
  const slot = await takePublicLookupSlot(request, { scope: "guest-otp", limit: 3, windowSeconds: 600, subject: parsed.data.email });
  if (slot === "unavailable") return fail("Dịch vụ xác thực tạm thời chưa sẵn sàng.", 503);
  if (slot === "limited") return fail("Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau 10 phút.", 429);
  try {
    const error = await sendGuestEmailOtp(parsed.data.email);
    if (error) return fail(error, 503);
    return ok({ message: "Nếu email hợp lệ, mã xác thực đã được gửi. Vui lòng kiểm tra hộp thư." });
  } catch {
    return fail("Dịch vụ email chưa được cấu hình.", 503);
  }
}
