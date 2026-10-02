import type { NextRequest } from "next/server";
import { RoleCode } from "@delivery/shared";
import { scanOperationalAlerts } from "@/lib/alert-scanner";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";

/**
 * POST /api/alerts/scan — quét đơn trễ/kẹt/luồng bất thường ngay lập tức.
 * Gọi bởi Admin/điều phối viên hoặc bởi cron ngoài kèm header x-cron-secret = CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const cronOk = Boolean(secret) && request.headers.get("x-cron-secret") === secret;
  if (!cronOk) {
    const auth = getAuthFromRequest(request);
    if (!auth) return fail("Unauthorized", 401);
    if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DISPATCHER) return fail("Forbidden", 403);
  }
  try {
    return ok(await scanOperationalAlerts());
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Không quét được cảnh báo", 500);
  }
}
