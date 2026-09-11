import { fail, ok } from "@/lib/api-response";
import { DatabaseService } from "@/database/database.service";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";
import { AuthService } from "@/services/auth.service";
import type { RegisterReqBody } from "@/requests/auth.requests";

export async function registerController(input: RegisterReqBody) {
  try {
    const database = new DatabaseService();
    const user = await new AuthService(
      new UserRepository(database),
      new RoleRepository(database),
    ).register(input);

    return ok({
      message: "Account registered successfully",
      user,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "An account with this email already exists") {
      return fail(message, 409);
    }
    if (message === "The customer role is not configured") {
      return fail(message, 500);
    }
    return fail("Unable to register the account", 500);
  }
}
