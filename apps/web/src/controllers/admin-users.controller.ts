import { RoleCode } from "@delivery/shared";
import type { NextRequest } from "next/server";
import { DatabaseService } from "@/database/database.service";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { AdminUsersService } from "@/services/admin-users.service";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";
import { WarehouseRepository } from "@/repositories/warehouse.repository";

function parsePositiveInteger(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

export async function adminUsersController(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);

  const page = parsePositiveInteger(
    request.nextUrl.searchParams.get("page"),
    1,
  );
  const limit = parsePositiveInteger(
    request.nextUrl.searchParams.get("limit"),
    10,
  );
  if (page === null || limit === null || limit > 50) {
    return fail("Invalid pagination parameters", 400);
  }

  const search = request.nextUrl.searchParams.get("search")?.trim() || undefined;

  try {
    const database = new DatabaseService();
    const result = await new AdminUsersService(
      new UserRepository(database),
      new RoleRepository(database),
      new WarehouseRepository(database),
    ).listUsers({ page, limit, search });

    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Account role is invalid") {
      return fail(message, 500);
    }
    return fail("Unable to load users", 500);
  }
}
