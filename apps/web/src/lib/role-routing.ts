import { RoleCode } from "@delivery/shared";

/** Trang dau vao cua tung vai tro sau khi dang nhap thanh cong. */
export const ROLE_HOME_PATH: Record<RoleCode, string> = {
  [RoleCode.ADMIN]: "/dashboard/admin",
  [RoleCode.DISPATCHER]: "/dashboard/dispatcher",
  [RoleCode.DELIVERY_STAFF]: "/dashboard/delivery",
  [RoleCode.SENDER]: "/contacts",
  [RoleCode.RECEIVER]: "/dashboard/receiver",
};

export const ROLE_LABEL: Record<RoleCode, string> = {
  [RoleCode.ADMIN]: "Quản trị viên",
  [RoleCode.DISPATCHER]: "Điều phối viên",
  [RoleCode.DELIVERY_STAFF]: "Nhân viên giao nhận",
  [RoleCode.SENDER]: "Người gửi",
  [RoleCode.RECEIVER]: "Người nhận",
};

export function roleHomePath(roleCode: RoleCode): string {
  return ROLE_HOME_PATH[roleCode];
}
