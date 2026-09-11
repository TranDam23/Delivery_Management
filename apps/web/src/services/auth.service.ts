import { normalizeRoleCode, RoleCode, UserStatus } from "@delivery/shared";
import {
  hashPassword,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
} from "@/lib/auth";
import type { LoginReqBody, RegisterReqBody } from "@/requests/auth.requests";
import type { PublicUser } from "@/models/schemas/User.schema";
import { AuthRepository } from "@/repositories/auth.repository";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";

export class AuthService {
  constructor(
    private readonly users?: UserRepository,
    private readonly roles?: RoleRepository,
    private readonly authRepository?: AuthRepository,
  ) {}

  async register(input: RegisterReqBody): Promise<PublicUser> {
    if (!this.users || !this.roles) {
      throw new Error("Registration repositories are not configured");
    }

    const email = input.email.trim().toLowerCase();
    const existingUser = await this.users.findByEmail(email);
    if (existingUser) {
      throw new Error("An account with this email already exists");
    }

    const customerRole = await this.roles.findByCode(RoleCode.CUSTOMER);
    if (!customerRole) throw new Error("The customer role is not configured");

    return this.users.createUser({
      role_id: customerRole.id,
      full_name: input.full_name.trim(),
      email,
      password_hash: await hashPassword(input.password),
      phone: input.phone ?? null,
      status: UserStatus.ACTIVE,
    });
  }

  async login(input: LoginReqBody): Promise<{
    user: {
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      status: UserStatus;
      roleCode: RoleCode;
    };
    accessToken: string;
    refreshToken: string;
  }> {
    if (!this.authRepository) throw new Error("Authentication repository is not configured");

    const user = await this.authRepository.findUserByEmail(
      input.email.trim().toLowerCase(),
    );
    if (!user) throw new Error("Invalid email or password");
    if (user.status !== UserStatus.ACTIVE) {
      throw new Error("Account is not active");
    }

    const passwordMatches = await verifyPassword(input.password, user.password_hash);
    if (!passwordMatches) throw new Error("Invalid email or password");

    const roleCode = normalizeRoleCode(user.roleCode);
    if (!roleCode) throw new Error("Account role is invalid");

    await this.authRepository.updateLastLoginAt(user.id);

    return {
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        roleCode,
      },
      accessToken: signAuthToken({ userId: user.id, roleCode, tokenType: "access" }),
      refreshToken: signAuthToken({ userId: user.id, roleCode, tokenType: "refresh" }),
    };
  }

  logout(accessToken: string): { message: string } {
    const token = verifyAuthToken(accessToken);
    if (token.tokenType !== "access") {
      throw new Error("Invalid access token");
    }

    return { message: "Logout successful" };
  }
}
