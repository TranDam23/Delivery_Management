import { RoleCode } from "@delivery/shared";
import type { NextRequest } from "next/server";
import { DatabaseService } from "@/database/database.service";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";
import { AdminUserDetailService } from "@/services/admin-user-detail.service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function adminUserDetailController(
  request: NextRequest,
  userId: string,
) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);
  if (!UUID_PATTERN.test(userId)) return fail("Invalid user id", 400);

  try {
    const database = new DatabaseService();
    const user = await new AdminUserDetailService(
      new UserRepository(database),
      new RoleRepository(database),
    ).getUser(userId);

    return ok({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "User not found") return fail(message, 404);
    if (message === "Account role is invalid") return fail(message, 500);
    return fail("Unable to load user", 500);
  }
}
