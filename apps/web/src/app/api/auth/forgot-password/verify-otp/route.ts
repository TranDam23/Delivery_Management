import type { NextRequest } from "next/server";
import { verifyPasswordRecoveryOtpController } from "@/controllers/forgot-password.controller";
import { fail } from "@/lib/api-response";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";
import { validateVerifyPasswordRecoveryOtpInput } from "@/validations/auth.validation";

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => null);
  const validation = validateVerifyPasswordRecoveryOtpInput(body);
  if (!validation.success) return fail(validation.error, 400);

  let slot: Awaited<ReturnType<typeof takePublicLookupSlot>>;
  try {
    slot = await takePublicLookupSlot(request, {
      scope: "password-recovery-verify",
      limit: 5,
      windowSeconds: 600,
      subject: validation.data.email,
    });
  } catch {
    return fail("Dịch vụ xác thực tạm thời chưa sẵn sàng.", 503);
  }
  if (slot === "unavailable") {
    return fail("Dịch vụ xác thực tạm thời chưa sẵn sàng.", 503);
  }
  if (slot === "limited") {
    return fail("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.", 429);
  }

  return verifyPasswordRecoveryOtpController(request);
}
