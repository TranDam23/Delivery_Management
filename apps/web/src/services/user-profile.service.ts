import { normalizeRoleCode, type RoleCode } from "@delivery/shared";
import type { PublicUser } from "@/models/schemas/User.schema";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";

export interface UserProfile {
  id: string;
  role: RoleCode;
  fullName: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  status: PublicUser["status"];
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export class UserProfileService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error("User not found");

    const role = await this.roles.findById(user.role_id);
    const roleCode = role ? normalizeRoleCode(role.code) : null;
    if (!roleCode) throw new Error("Account role is invalid");

    return {
      id: user.id,
      role: roleCode,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLoginAt: user.last_login_at,
    };
  }
}
