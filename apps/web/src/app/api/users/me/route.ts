import type { NextRequest } from "next/server";
import { userProfileController } from "@/controllers/user-profile.controller";
import { updateUserProfileController } from "@/controllers/update-user-profile.controller";

export async function GET(request: NextRequest) {
  return userProfileController(request);
}

export async function PATCH(request: NextRequest) {
  return updateUserProfileController(request);
}
