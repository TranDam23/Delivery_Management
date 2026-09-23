import type { NextRequest } from "next/server";
import { logoutController } from "@/controllers/auth.controller";
import { fail } from "@/lib/api-response";
import { validateAuthorizationHeader } from "@/validations/auth.validation";

export async function POST(request: NextRequest) {
  const validation = validateAuthorizationHeader(
    request.headers.get("authorization"),
  );
  if (!validation.success) return fail(validation.error, 401);

  return logoutController(validation.token);
}
