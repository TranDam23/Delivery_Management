import { fail, ok } from "@/lib/api-response";
import { DatabaseService } from "@/database/database.service";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";
import { AuthService } from "@/services/auth.service";
import { AuthRepository } from "@/repositories/auth.repository";
import { RefreshTokenRepository } from "@/repositories/refresh-token.repository";
import type { LoginReqBody, RegisterReqBody } from "@/requests/auth.requests";

export async function registerController(input: RegisterReqBody) {
  try {
    const database = new DatabaseService();
    const user = await new AuthService(
      new UserRepository(database),
      new RoleRepository(database),
    ).register(input);

    return ok({
      message: "Account registered successfully",
      user,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "An account with this email already exists") {
      return fail(message, 409);
    }
    if (message === "The customer role is not configured") {
      return fail(message, 500);
    }
    if (message === "Email verification failed") {
      return fail("Mã OTP không đúng hoặc đã hết hạn.", 401);
    }
    if (message === "Email verification service unavailable") {
      return fail("Dịch vụ xác thực email tạm thời chưa sẵn sàng.", 503);
    }
    return fail("Unable to register the account", 500);
  }
}

export async function requestRegistrationOtpController(email: string) {
  try {
    const database = new DatabaseService();
    await new AuthService(
      new UserRepository(database),
      new RoleRepository(database),
    ).requestRegistrationOtp(email);

    return ok({
      message: "Mã xác thực đã được gửi nếu email đủ điều kiện đăng ký.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "An account with this email already exists") {
      return fail(message, 409);
    }
    if (message === "Unable to send verification code") {
      return fail("Không gửi được mã xác thực. Vui lòng thử lại sau.", 503);
    }
    return fail("Không thể gửi mã xác thực lúc này.", 503);
  }
}

export async function loginController(input: LoginReqBody) {
  try {
    const database = new DatabaseService();
    const result = await new AuthService(
      new UserRepository(database),
      new RoleRepository(database),
      new AuthRepository(database),
      new RefreshTokenRepository(database),
    ).login(input);

    return ok({
      message: "Login successful",
      token: result.accessToken,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Invalid email or password") return fail(message, 401);
    if (message === "Account is not active") return fail(message, 403);
    if (message === "Account role is invalid") return fail(message, 403);
    return fail("Unable to login", 500);
  }
}

export async function logoutController(accessToken: string) {
  try {
    const result = new AuthService().logout(accessToken);

    return ok(result);
  } catch {
    return fail("Invalid or expired access token", 401);
  }
}
