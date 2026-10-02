import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { checkOrderViewAccess } from "@/lib/order-access";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams { params: Promise<{ id: string }> }

const patchSchema = z.object({ status: z.enum(["acknowledged", "resolved", "dismissed"]) });

/** PATCH /api/alerts/:id — tiếp nhận, xử lý xong hoặc bỏ qua một cảnh báo. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DISPATCHER) return fail("Forbidden", 403);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Trạng thái không hợp lệ", 400);
  const { id } = await params;

  const db = getSupabaseServiceClient();
  const { data: alert, error: readError } = await db.from("alerts").select("id, order_id, status").eq("id", id).maybeSingle();
  if (readError) return fail(readError.message, 500);
  if (!alert) return fail("Không tìm thấy cảnh báo", 404);
  if (alert.order_id) {
    const access = await checkOrderViewAccess(db, auth, alert.order_id);
    if (!access.allowed) return fail(access.error, access.status);
  } else if (auth.roleCode !== RoleCode.ADMIN) {
    return fail("Forbidden", 403);
  }

  const closing = parsed.data.status !== "acknowledged";
  const { error } = await db.from("alerts").update({
    status: parsed.data.status,
    resolved_at: closing ? new Date().toISOString() : null,
    resolved_by: closing ? auth.userId : null,
  }).eq("id", id);
  if (error) return fail(error.message, 500);
  await writeAuditLog({ userId: auth.userId, action: `ALERT_${parsed.data.status.toUpperCase()}`, entityType: "alert", entityId: id, oldData: { status: alert.status }, newData: { status: parsed.data.status }, request });
  return ok({ id, status: parsed.data.status });
}
