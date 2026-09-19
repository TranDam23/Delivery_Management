import type { NextRequest } from "next/server";
import { userProfileController } from "@/controllers/user-profile.controller";

export async function GET(request: NextRequest) {
  return userProfileController(request);
}
