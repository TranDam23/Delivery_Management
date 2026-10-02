import type { NextRequest } from "next/server";
import { resetPasswordController } from "@/controllers/reset-password.controller";
import { fail } from "@/lib/api-response";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";

export async function POST(request: NextRequest) {
  let slot: Awaited<ReturnType<typeof takePublicLookupSlot>>;
  try {
    slot = await takePublicLookupSlot(request, {
      scope: "password-recovery-complete",
      limit: 5,
      windowSeconds: 600,
    });
  } catch {
    return fail("Dịch vụ đặt lại mật khẩu tạm thời chưa sẵn sàng.", 503);
  }
  if (slot === "unavailable") {
    return fail("Dịch vụ đặt lại mật khẩu tạm thời chưa sẵn sàng.", 503);
  }
  if (slot === "limited") {
    return fail("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.", 429);
  }

  return resetPasswordController(request);
}
