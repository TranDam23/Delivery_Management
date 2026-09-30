import type { UpdateUserProfileReqBody } from "@/requests/auth.requests";
import { RoleRepository } from "@/repositories/role.repository";
import { UserRepository } from "@/repositories/user.repository";
import { UserProfileService, type UserProfile } from "@/services/user-profile.service";

export class UpdateUserProfileService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async updateProfile(
    userId: string,
    input: UpdateUserProfileReqBody,
  ): Promise<{ message: string; user: UserProfile }> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error("User not found");

    await this.users.updateProfile(user.id, {
      ...(input.fullName !== undefined && { full_name: input.fullName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.avatar !== undefined && { avatar: input.avatar }),
    });

    const updatedUser = await new UserProfileService(
      this.users,
      this.roles,
    ).getProfile(user.id);

    return {
      message: "Profile updated successfully",
      user: updatedUser,
    };
  }
}
