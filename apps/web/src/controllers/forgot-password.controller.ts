import type { NextRequest } from "next/server";
import { DatabaseService } from "@/database/database.service";
import { fail, ok } from "@/lib/api-response";
import {
  PASSWORD_RESET_COOKIE,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
} from "@/lib/password-reset";
import { PasswordResetTokenRepository } from "@/repositories/password-reset-token.repository";
import { UserRepository } from "@/repositories/user.repository";
import { ForgotPasswordService, PASSWORD_RESET_REQUEST_MESSAGE } from "@/services/forgot-password.service";
import { validateForgotPasswordInput, validateVerifyPasswordRecoveryOtpInput } from "@/validations/auth.validation";

function createForgotPasswordService(database: DatabaseService): ForgotPasswordService {
  return new ForgotPasswordService(
    new UserRepository(database),
    new PasswordResetTokenRepository(database),
  );
}

export async function forgotPasswordController(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const validation = validateForgotPasswordInput(body);
  if (!validation.success) return fail(validation.error, 400);

  try {
    const database = new DatabaseService();
    await createForgotPasswordService(database).requestOtp(validation.data);
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "Password recovery email provider unavailable"
    ) {
      console.error("Password recovery request could not be delivered");
    } else {
      console.error("Password recovery request could not be processed");
      return fail("Dịch vụ khôi phục mật khẩu tạm thời chưa sẵn sàng.", 503);
    }
  }

  const response = ok({ message: PASSWORD_RESET_REQUEST_MESSAGE }, 202);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function verifyPasswordRecoveryOtpController(
  request: NextRequest,
) {
  const body = await request.json().catch(() => null);
  const validation = validateVerifyPasswordRecoveryOtpInput(body);
  if (!validation.success) return fail(validation.error, 400);

  try {
    const database = new DatabaseService();
    const resetToken = await createForgotPasswordService(database).verifyOtp(
      validation.data,
    );
    if (!resetToken) {
      return fail("Mã OTP không đúng, đã hết hạn hoặc không thể sử dụng.", 401);
    }

    const response = ok({ message: "Email đã được xác minh." });
    response.cookies.set(PASSWORD_RESET_COOKIE, resetToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/reset-password",
      maxAge: PASSWORD_RESET_TOKEN_TTL_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    console.error("Password recovery OTP verification could not be completed");
    return fail("Không thể xác minh OTP lúc này.", 503);
  }
}
