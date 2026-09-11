import { LegacyRoleCode, RoleCode } from "../enums";

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
  tokenType: "access" | "refresh";
}

/** Thong tin tai khoan an toan de gui ve client sau khi dang nhap. */
export interface AuthenticatedUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  roleCode: RoleCode;
}

const ROLE_CODES = Object.values(RoleCode) as string[];

/** Type guard dung o ranh gioi he thong (dang nhap, doc token) truoc khi tin vao roleCode. */
export function isRoleCode(value: unknown): value is RoleCode {
  return typeof value === "string" && ROLE_CODES.includes(value);
}

/**
 * Chuan hoa role tai khoan cu ve CUSTOMER de giao dien va token dung chung.
 * SENDER/RECEIVER van duoc chap nhan tam thoi vi database co the dang chua
 * chay migration gop role.
 */
export function normalizeRoleCode(value: unknown): RoleCode | null {
  if (value === LegacyRoleCode.SENDER || value === LegacyRoleCode.RECEIVER) {
    return RoleCode.CUSTOMER;
  }

  return isRoleCode(value) ? value : null;
}
