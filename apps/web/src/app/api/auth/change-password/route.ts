import type { NextRequest } from "next/server";
import { changePasswordController } from "@/controllers/change-password.controller";

export async function POST(request: NextRequest) {
  return changePasswordController(request);
}
