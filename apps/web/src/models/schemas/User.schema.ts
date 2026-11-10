import type { Database } from "@delivery/database";

export type User = Database["public"]["Tables"]["users"]["Row"];
export type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
export type UserUpdate = Database["public"]["Tables"]["users"]["Update"];
/** Hồ sơ công khai của tài khoản: bỏ mật khẩu và các cấu hình riêng của shipper (đọc qua thư viện shipper-capacity). */
export type PublicUser = Omit<User, "password_hash" | "shipper_type" | "daily_assignment_limit">;
