export interface RegisterReqBody {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
  otp: string;
  phone?: string | null;
}

export interface RegisterOtpReqBody {
  email: string;
}

export interface LoginReqBody {
  email: string;
  password: string;
}

export interface ChangePasswordReqBody {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ForgotPasswordReqBody {
  email: string;
}

export interface ResetPasswordReqBody {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UpdateUserProfileReqBody {
  fullName?: string;
  phone?: string | null;
  avatar?: string | null;
}
