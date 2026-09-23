import { normalizeRoleCode, type RoleCode } from "@delivery/shared";
import type { PublicUser } from "@/models/schemas/User.schema";
import {
  UserRepository,
  type ListUsersResult,
} from "@/repositories/user.repository";
import { RoleRepository } from "@/repositories/role.repository";
import { WarehouseRepository } from "@/repositories/warehouse.repository";

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
  full_name: string;
  province: string | null;
  warehouse_id: string | null;
  roles: { code: string; name: string } | null;
  warehouses: {
    id: string;
    code: string;
    name: string;
    province: string;
    warehouse_level: string;
  } | null;
}

export class AdminUsersService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly warehouses: WarehouseRepository,
  ) {}

  async listUsers(params: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{
    users: AdminUser[];
    warehouses: Awaited<ReturnType<WarehouseRepository["listActive"]>>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const result: ListUsersResult = await this.users.listUsers(params);
    const warehouses = await this.warehouses.listActive();
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
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          province: user.province,
          warehouse_id: user.warehouse_id,
          roles: user.roles,
          warehouses: user.warehouses,
          status: user.status,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          lastLoginAt: user.last_login_at,
        };
      }),
    );

    return {
      users,
      warehouses,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / params.limit),
      },
    };
  }
}
