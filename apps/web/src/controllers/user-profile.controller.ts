import type { NextRequest } from "next/server";
import { DatabaseService } from "@/database/database.service";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";
import { UserProfileService } from "@/services/user-profile.service";

export async function userProfileController(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  try {
    const database = new DatabaseService();
    const profile = await new UserProfileService(
      new UserRepository(database),
      new RoleRepository(database),
    ).getProfile(auth.userId);

    return ok(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "User not found") return fail(message, 404);
    if (message === "Account role is invalid") return fail(message, 500);
    return fail("Unable to load profile", 500);
  }
}
