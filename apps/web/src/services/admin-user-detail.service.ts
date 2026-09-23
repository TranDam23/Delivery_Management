import { normalizeRoleCode } from "@delivery/shared";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";

export interface AdminUserDetail {
  id: string;
  role: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export class AdminUserDetailService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async getUser(userId: string): Promise<AdminUserDetail> {
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
