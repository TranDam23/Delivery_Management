import type { NextRequest } from "next/server";
import { registerController } from "@/controllers/auth.controller";
import { validateRegisterInput } from "@/validations/auth.validation";

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

  return registerController(validation.data);
}
