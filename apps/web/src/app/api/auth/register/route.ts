import type { NextRequest } from "next/server";
import { registerController } from "@/controllers/auth.controller";
import { validateRegisterInput } from "@/validations/auth.validation";
import { takePublicLookupSlot } from "@/lib/public-lookup-limit";
import { fail } from "@/lib/api-response";

/** POST /api/auth/register — public customer registration. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const validation = validateRegisterInput(body);
  if (!validation.success) {
    return Response.json(
      { success: false, error: validation.error },
      { status: 400 },
    );
  }

  let slot: Awaited<ReturnType<typeof takePublicLookupSlot>>;
  try {
    slot = await takePublicLookupSlot(request, {
      scope: "register-verify",
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

  return registerController(validation.data);
}
