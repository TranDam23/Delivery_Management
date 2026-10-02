import type { NextRequest } from "next/server";
import { forgotPasswordController } from "@/controllers/forgot-password.controller";
import { fail } from "@/lib/api-response";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";
import { validateForgotPasswordInput } from "@/validations/auth.validation";

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => null);
  const validation = validateForgotPasswordInput(body);
  if (!validation.success) return fail(validation.error, 400);

  let slot: Awaited<ReturnType<typeof takePublicLookupSlot>>;
  try {
    slot = await takePublicLookupSlot(request, {
      scope: "password-recovery-send",
      limit: 3,
      windowSeconds: 600,
      subject: validation.data.email,
    });
  } catch {
    return fail("Dịch vụ khôi phục mật khẩu tạm thời chưa sẵn sàng.", 503);
  }
  if (slot === "unavailable") {
    return fail("Dịch vụ khôi phục mật khẩu tạm thời chưa sẵn sàng.", 503);
  }
  if (slot === "limited") {
    return fail("Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau.", 429);
  }

  return forgotPasswordController(request);
}
