import { RoleCode, UserStatus } from "@delivery/shared";
import { hashPassword } from "@/lib/auth";
import type { RegisterReqBody } from "@/requests/auth.requests";
import type { PublicUser } from "@/models/schemas/User.schema";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async register(input: RegisterReqBody): Promise<PublicUser> {
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
}
