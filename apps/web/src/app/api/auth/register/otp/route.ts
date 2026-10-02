import type { NextRequest } from "next/server";
import { requestRegistrationOtpController } from "@/controllers/auth.controller";
import { fail } from "@/lib/api-response";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";
import { validateRegisterOtpInput } from "@/validations/auth.validation";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const validation = validateRegisterOtpInput(body);
  if (!validation.success) return fail(validation.error);

  let slot: Awaited<ReturnType<typeof takePublicLookupSlot>>;
  try {
    slot = await takePublicLookupSlot(request, {
      scope: "register-otp",
      limit: 3,
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
    return fail("Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau.", 429);
  }

  return requestRegistrationOtpController(validation.data.email);
}
