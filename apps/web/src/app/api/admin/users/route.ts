import type { NextRequest } from "next/server";
import { adminUsersController } from "@/controllers/admin-users.controller";

export async function GET(request: NextRequest) {
  return adminUsersController(request);
}
