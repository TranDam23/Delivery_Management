import type { NextRequest } from "next/server";
import { DatabaseService } from "@/database/database.service";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";
import { UpdateUserProfileService } from "@/services/update-user-profile.service";
import { validateUpdateUserProfileInput } from "@/validations/auth.validation";

export async function updateUserProfileController(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const validation = validateUpdateUserProfileInput(body);
  if (!validation.success) return fail(validation.error, 400);

  try {
    const database = new DatabaseService();
    const result = await new UpdateUserProfileService(
      new UserRepository(database),
      new RoleRepository(database),
    ).updateProfile(auth.userId, validation.data);

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "User not found") return fail(message, 404);
    if (message === "Account role is invalid") return fail(message, 500);
    return fail("Unable to update profile", 500);
  }
}
