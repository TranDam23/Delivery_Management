import { DatabaseService } from "@/database/database.service";
import { fail, ok } from "@/lib/api-response";
import { RefreshTokenRepository } from "@/repositories/refresh-token.repository";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";
import { RefreshTokenService } from "@/services/refresh-token.service";

export async function refreshTokenController(request: Request) {
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    !("refreshToken" in body) ||
    typeof body.refreshToken !== "string" ||
    body.refreshToken.length === 0
  ) {
    return fail("refreshToken is required", 400);
  }

  try {
    const database = new DatabaseService();
    const result = await new RefreshTokenService(
      new RefreshTokenRepository(database),
      new UserRepository(database),
      new RoleRepository(database),
    ).refreshAccessToken(body.refreshToken);

    return ok({
      message: "Token refreshed successfully",
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Account is not active") return fail(message, 403);
    if (message === "Account role is invalid") return fail(message, 403);
    if (message === "Invalid or expired refresh token") {
      return fail(message, 401);
    }
    return fail("Unable to refresh token", 500);
  }
}
