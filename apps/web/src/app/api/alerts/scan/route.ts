import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { RoleCode } from "@delivery/shared";
import { scanOperationalAlerts } from "@/lib/alert-scanner";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";

function sameSecret(provided: string | null, secret: string): boolean {
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Cron hợp lệ khi gửi CRON_SECRET qua header x-cron-secret hoặc Authorization: Bearer (Vercel Cron). */
function isCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  return sameSecret(request.headers.get("x-cron-secret"), secret) || sameSecret(bearer, secret);
}

/** GET /api/alerts/scan — dành cho cron của nền tảng hosting (chỉ chấp nhận khi có CRON_SECRET hợp lệ). */
export async function GET(request: NextRequest) {
  if (!isCron(request)) return fail("Unauthorized", 401);
  try {
    return ok(await scanOperationalAlerts());
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Không quét được cảnh báo", 500);
  }
}

/**
 * POST /api/alerts/scan — quét đơn trễ/kẹt/luồng bất thường ngay lập tức.
 * Gọi bởi Admin/điều phối viên hoặc bởi cron ngoài kèm CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!isCron(request)) {
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
