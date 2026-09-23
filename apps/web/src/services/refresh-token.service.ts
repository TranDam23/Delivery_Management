import { normalizeRoleCode, UserStatus } from "@delivery/shared";
import { hashRefreshToken, signAuthToken } from "@/lib/auth";
import { RefreshTokenRepository } from "@/repositories/refresh-token.repository";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";

export class RefreshTokenService {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string }> {
    const tokenRecord = await this.refreshTokens.findByTokenHash(
      hashRefreshToken(refreshToken),
    );

    if (!tokenRecord || tokenRecord.revoked_at !== null) {
      throw new Error("Invalid or expired refresh token");
    }

    if (new Date(tokenRecord.expires_at) <= new Date()) {
      throw new Error("Invalid or expired refresh token");
    }

    const user = await this.users.findById(tokenRecord.user_id);
    if (!user) throw new Error("Invalid or expired refresh token");
    if (user.status !== UserStatus.ACTIVE) {
      throw new Error("Account is not active");
    }

    const role = await this.roles.findById(user.role_id);
    const roleCode = normalizeRoleCode(role?.code);
    if (!roleCode) throw new Error("Account role is invalid");

    return {
      accessToken: signAuthToken({
        userId: user.id,
        roleCode,
        tokenType: "access",
      }),
    };
  }
}
