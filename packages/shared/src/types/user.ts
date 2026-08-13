import type { UserStatus } from "../enums";

export interface User {
  id: string;
  role_id: string;
  full_name: string;
  email: string;
  password_hash: string;
  phone: string | null;
  avatar: string | null;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export type PublicUser = Omit<User, "password_hash">;
