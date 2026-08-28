import { RoleCode } from "../enums";

/**
 * Noi dung JWT dung chung cho ca web lan mobile.
 *
 * roleCode BAT BUOC la mot RoleCode hop le, khong phai string tu do:
 * state machine cua nhom Giao nhan guard theo vai tro (quy tac 3.1.3.7),
 * nen mot chuoi rong hoac sai chinh ta se lam moi guard im lang truot qua
 * thay vi bao loi.
 */
export interface AuthTokenPayload {
  userId: string;
  roleCode: RoleCode;
}

const ROLE_CODES = Object.values(RoleCode) as string[];

/** Type guard dung o ranh gioi he thong (dang nhap, doc token) truoc khi tin vao roleCode. */
export function isRoleCode(value: unknown): value is RoleCode {
  return typeof value === "string" && ROLE_CODES.includes(value);
}
