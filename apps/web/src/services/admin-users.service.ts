import { normalizeRoleCode, type RoleCode } from "@delivery/shared";
import type { PublicUser } from "@/models/schemas/User.schema";
import {
  UserRepository,
  type ListUsersResult,
} from "@/repositories/user.repository";
import { RoleRepository } from "@/repositories/role.repository";

export interface AdminUser {
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

export class AdminUsersService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async listUsers(params: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{
    users: AdminUser[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const result: ListUsersResult = await this.users.listUsers(params);
    const roleCache = new Map<string, RoleCode>();

    const users = await Promise.all(
      result.users.map(async (user) => {
        let roleCode: RoleCode | null = roleCache.get(user.role_id) ?? null;
        if (!roleCode) {
          const role = await this.roles.findById(user.role_id);
          roleCode = role ? normalizeRoleCode(role.code) : null;
          if (!roleCode) throw new Error("Account role is invalid");
          roleCache.set(user.role_id, roleCode);
        }

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
      }),
    );

    return {
      users,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / params.limit),
      },
    };
  }
}
