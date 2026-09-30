import { UserStatus } from "@delivery/shared";
import {
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import type { ChangePasswordReqBody } from "@/requests/auth.requests";
import { UserRepository } from "@/repositories/user.repository";

export class ChangePasswordService {
  constructor(private readonly users: UserRepository) {}

  async changePassword(
    userId: string,
    input: ChangePasswordReqBody,
  ): Promise<{ message: string }> {
    const user = await this.users.findPasswordUserById(userId);
    if (!user) throw new Error("Account not found");
    if (user.status !== UserStatus.ACTIVE) {
      throw new Error("Account is not active");
    }

    const currentPasswordMatches = await verifyPassword(
      input.currentPassword,
      user.password_hash,
    );
    if (!currentPasswordMatches) {
      throw new Error("Current password is incorrect");
    }

    if (input.newPassword !== input.confirmPassword) {
      throw new Error("New password and confirm password do not match");
    }

    if (input.currentPassword === input.newPassword) {
      throw new Error("New password must be different");
    }

    const newPasswordMatches = await verifyPassword(
      input.newPassword,
      user.password_hash,
    );
    if (newPasswordMatches) {
      throw new Error("New password must be different");
    }

    await this.users.updatePasswordHash(
      user.id,
      await hashPassword(input.newPassword),
    );

    return { message: "Password changed successfully" };
  }
}
