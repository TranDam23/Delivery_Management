import type { NextRequest } from "next/server";
import { resetPasswordController } from "@/controllers/reset-password.controller";

export async function POST(request: NextRequest) {
  return resetPasswordController(request);
}
