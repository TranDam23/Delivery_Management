export interface RegisterReqBody {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
  phone?: string | null;
}
