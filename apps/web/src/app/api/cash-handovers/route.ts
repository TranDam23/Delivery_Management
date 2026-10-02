import type { NextRequest } from "next/server";
import { RoleCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { handoverWarehouseScope, type HandoverItem, type HandoverSummary } from "@/lib/cash-handover";
import { relationValue } from "@/lib/order-ui";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const HANDOVER_SELECT = `id, shipper_id, status, cod_amount, fee_amount, submitted_at, confirmed_at, note,
  shipper:users!cash_handovers_shipper_id_fkey(full_name),
  warehouse:warehouses!cash_handovers_warehouse_id_fkey(name),
  cash_handover_items(order_id, kind, amount, orders(tracking_code))`;

interface HandoverRow {
  id: string;
  status: string;
  cod_amount: number;
  fee_amount: number;
  submitted_at: string;
  confirmed_at: string | null;
  note: string | null;
  shipper: { full_name: string } | { full_name: string }[] | null;
  warehouse: { name: string } | { name: string }[] | null;
  cash_handover_items: Array<{ order_id: string; kind: string; amount: number; orders: { tracking_code: string } | { tracking_code: string }[] | null }>;
}

function toSummary(row: HandoverRow): HandoverSummary {
  return {
    id: row.id,
    status: row.status as HandoverSummary["status"],
    codAmount: Number(row.cod_amount),
    feeAmount: Number(row.fee_amount),
    submittedAt: row.submitted_at,
    confirmedAt: row.confirmed_at,
    note: row.note,
    shipperName: relationValue(row.shipper)?.full_name ?? "—",
    warehouseName: relationValue(row.warehouse)?.name ?? "—",
    items: row.cash_handover_items.map((item): HandoverItem => ({
      orderId: item.order_id,
      trackingCode: relationValue(item.orders)?.tracking_code ?? "—",
      kind: item.kind as HandoverItem["kind"],
      amount: Number(item.amount),
    })),
  };
}

/**
 * GET /api/cash-handovers
 * - Shipper: các khoản tiền mặt đã thu chưa nộp + lịch sử phiếu của mình.
 * - Nhân viên kho / điều phối / admin: phiếu nộp trong phạm vi kho (lọc ?status=pending|confirmed|rejected|all).
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  const db = getSupabaseServiceClient();

  if (auth.roleCode === RoleCode.DELIVERY_STAFF) {
    const [cod, fees, history] = await Promise.all([
      db.from("cod_transactions").select("order_id, amount, orders(tracking_code)")
        .eq("collected_by", auth.userId).eq("status", "collected").is("handover_id", null).is("handed_over_at", null),
      db.from("orders").select("id, tracking_code, total_fee")
        .eq("shipping_payment_method", "cash").eq("shipping_payment_status", "paid").eq("shipping_paid_by", auth.userId).is("shipping_handover_id", null),
      db.from("cash_handovers").select(HANDOVER_SELECT).eq("shipper_id", auth.userId).order("submitted_at", { ascending: false }).limit(30),
    ]);
    if (cod.error) return fail(cod.error.message, 500);
    if (fees.error) return fail(fees.error.message, 500);
    if (history.error) return fail(history.error.message, 500);
    const pending: HandoverItem[] = [
      ...(cod.data ?? []).map((row): HandoverItem => ({ orderId: row.order_id, trackingCode: relationValue(row.orders)?.tracking_code ?? "—", kind: "cod", amount: Number(row.amount) })),
      ...(fees.data ?? []).map((row): HandoverItem => ({ orderId: row.id, trackingCode: row.tracking_code, kind: "shipping_fee", amount: Number(row.total_fee) })),
    ];
    return ok({ pending, handovers: ((history.data ?? []) as unknown as HandoverRow[]).map(toSummary) });
  }

  const scope = await handoverWarehouseScope(auth);
  if (scope.error) return fail(scope.error, scope.error === "Forbidden" ? 403 : 409);
  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  let query = db.from("cash_handovers").select(HANDOVER_SELECT).order("submitted_at", { ascending: false }).limit(100);
  if (status !== "all") query = query.eq("status", status);
  if (scope.ids !== null) {
    if (scope.ids.length === 0) return ok({ pending: [], handovers: [] });
    query = query.in("warehouse_id", scope.ids);
  }
  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return ok({ pending: [], handovers: ((data ?? []) as unknown as HandoverRow[]).map(toSummary) });
}

/** POST /api/cash-handovers — shipper lập phiếu nộp toàn bộ tiền mặt (COD + phí) đã thu mà chưa nộp. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.DELIVERY_STAFF) return fail("Forbidden", 403);
  const { data, error } = await getSupabaseServiceClient().rpc("create_cash_handover", { p_shipper: auth.userId });
  if (error) {
    if (error.message.includes("NOTHING_TO_HAND_OVER")) return fail("Không có khoản tiền mặt nào cần nộp", 409);
    if (error.message.includes("SHIPPER_NO_WAREHOUSE")) return fail("Tài khoản chưa được gán kho nên chưa nộp tiền được", 409);
    return fail(error.message, 500);
  }
  await writeAuditLog({ userId: auth.userId, action: "CASH_HANDOVER_SUBMITTED", entityType: "cash_handover", entityId: data, request });
  return ok({ id: data }, 201);
}
