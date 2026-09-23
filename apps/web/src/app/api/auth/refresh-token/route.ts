import type { NextRequest } from "next/server";
import { refreshTokenController } from "@/controllers/refresh-token.controller";

export async function POST(request: NextRequest) {
  return refreshTokenController(request);
}
