import type { NextRequest } from "next/server";
import { adminUserDetailController } from "@/controllers/admin-user-detail.controller";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return adminUserDetailController(request, id);
}
