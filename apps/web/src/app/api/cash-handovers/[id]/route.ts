import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { handoverWarehouseScope } from "@/lib/cash-handover";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams { params: Promise<{ id: string }> }

const actionSchema = z.object({
  action: z.enum(["confirm", "reject"]),
  note: z.string().trim().max(300).optional(),
});

/**
 * PATCH /api/cash-handovers/:id — nhân viên kho của bưu cục (hoặc điều phối/admin trong phạm vi)
 * xác nhận đã nhận đủ tiền, hoặc từ chối để shipper lập lại phiếu. Từ chối bắt buộc có lý do.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Hành động không hợp lệ", 400);
  if (parsed.data.action === "reject" && !parsed.data.note) return fail("Từ chối phiếu phải kèm lý do", 400);
  const { id } = await params;

  const scope = await handoverWarehouseScope(auth);
  if (scope.error) return fail(scope.error, scope.error === "Forbidden" ? 403 : 409);

  const db = getSupabaseServiceClient();
  const { data: handover, error: readError } = await db.from("cash_handovers")
    .select("id, warehouse_id, status, cod_amount, fee_amount").eq("id", id).maybeSingle();
  if (readError) return fail(readError.message, 500);
  if (!handover) return fail("Không tìm thấy phiếu nộp tiền", 404);
  if (scope.ids !== null && !scope.ids.includes(handover.warehouse_id)) return fail("Phiếu này không thuộc kho phụ trách của bạn", 403);
  if (handover.status !== "pending") return fail("Phiếu đã được xử lý", 409);

  const rpcName = parsed.data.action === "confirm" ? "confirm_cash_handover" : "reject_cash_handover";
  const { error } = await db.rpc(rpcName, { p_id: id, p_user: auth.userId, p_note: parsed.data.note ?? "" });
  if (error) {
    if (error.message.includes("HANDOVER_NOT_PENDING")) return fail("Phiếu đã được xử lý bởi người khác", 409);
    return fail(error.message, 500);
  }
  await writeAuditLog({
    userId: auth.userId,
    action: parsed.data.action === "confirm" ? "CASH_HANDOVER_CONFIRMED" : "CASH_HANDOVER_REJECTED",
    entityType: "cash_handover",
    entityId: id,
    oldData: { status: "pending" },
    newData: { status: parsed.data.action === "confirm" ? "confirmed" : "rejected", cod: Number(handover.cod_amount), fee: Number(handover.fee_amount), note: parsed.data.note ?? null },
    request,
  });
  return ok({ id, status: parsed.data.action === "confirm" ? "confirmed" : "rejected" });
}
