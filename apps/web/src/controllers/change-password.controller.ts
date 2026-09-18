import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { UserRepository } from "@/repositories/user.repository";
import { DatabaseService } from "@/database/database.service";
import { ChangePasswordService } from "@/services/change-password.service";
import { validateChangePasswordInput } from "@/validations/auth.validation";

export async function changePasswordController(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const validation = validateChangePasswordInput(body);
  if (!validation.success) return fail(validation.error, 400);

  try {
    const result = await new ChangePasswordService(
      new UserRepository(new DatabaseService()),
    ).changePassword(auth.userId, validation.data);

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Account not found") return fail("Unauthorized", 401);
    if (message === "Account is not active") return fail(message, 403);
    if (message === "Current password is incorrect") {
      return fail(message, 401);
    }
    if (message === "New password and confirm password do not match") {
      return fail(message, 400);
    }
    if (message === "New password must be different") {
      return fail(message, 400);
    }
    return fail("Unable to change password", 500);
  }
}
