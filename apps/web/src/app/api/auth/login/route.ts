import type { NextRequest } from "next/server";
import { loginController } from "@/controllers/auth.controller";
import { validateLoginInput } from "@/validations/auth.validation";
import { fail } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const validation = validateLoginInput(body);
  if (!validation.success) return fail(validation.error, 400);

  return loginController(validation.data);
}
