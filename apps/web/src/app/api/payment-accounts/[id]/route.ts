import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { PAYMENT_ACCOUNT_FIELDS, type PaymentAccount } from "@/lib/payment-accounts";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams { params: Promise<{ id: string }> }

const patchSchema = z.object({ is_active: z.boolean() });

/** PATCH /api/payment-accounts/:id — bật/tắt nhận tiền; bật thì tắt tài khoản cùng loại đang dùng. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Dữ liệu không hợp lệ", 400);
  const { id } = await params;

  const supabase = getSupabaseServiceClient();
  const { data: account, error: readError } = await supabase.from("payment_accounts").select("id, kind").eq("id", id).maybeSingle();
  if (readError) return fail(readError.message, 500);
  if (!account) return fail("Không tìm thấy tài khoản", 404);

  if (parsed.data.is_active) {
    const { error } = await supabase.from("payment_accounts").update({ is_active: false }).eq("kind", account.kind).eq("is_active", true).neq("id", id);
    if (error) return fail(error.message, 500);
  }
  const { data, error } = await supabase.from("payment_accounts").update({ is_active: parsed.data.is_active }).eq("id", id).select(PAYMENT_ACCOUNT_FIELDS).single();
  if (error) return fail(error.message, 500);
  await writeAuditLog({ userId: auth.userId, action: parsed.data.is_active ? "PAYMENT_ACCOUNT_ACTIVATED" : "PAYMENT_ACCOUNT_DEACTIVATED", entityType: "payment_account", entityId: id, newData: { is_active: parsed.data.is_active }, request });
  return ok(data as PaymentAccount);
}

/** DELETE /api/payment-accounts/:id — đơn cũ giữ bản chụp nên xóa không mất dấu đối soát. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);
  const { id } = await params;
  const { error } = await getSupabaseServiceClient().from("payment_accounts").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  await writeAuditLog({ userId: auth.userId, action: "PAYMENT_ACCOUNT_DELETED", entityType: "payment_account", entityId: id, request });
  return ok({ deleted: true });
}
