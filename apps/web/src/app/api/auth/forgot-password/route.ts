import type { NextRequest } from "next/server";
import { forgotPasswordController } from "@/controllers/forgot-password.controller";

export async function POST(request: NextRequest) {
  return forgotPasswordController(request);
}
