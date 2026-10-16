import type { NextRequest } from "next/server";
import { RoleCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const PAGE_SIZE = 30;
const MAX_PAGE = 10000;

function parsePage(value: string | null) {
  if (value === null || value === "") return 1;
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= MAX_PAGE ? page : null;
}

function parseDateOnly(value: string | null) {
  if (value === null || value === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : undefined;
}

function escapeIlikeLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** GET /api/audit-logs — Admin xem lịch sử thao tác quan trọng (lọc theo hành động, thực thể, thời gian). */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);

  const params = request.nextUrl.searchParams;
  const page = parsePage(params.get("page"));
  if (page === null) return fail("Trang không hợp lệ", 400);
  const pageSize = PAGE_SIZE;
  const from = parseDateOnly(params.get("from"));
  const to = parseDateOnly(params.get("to"));
  if (from === undefined || to === undefined) return fail("Ngày lọc không hợp lệ", 400);
  if (from && to && from.getTime() > to.getTime()) return fail("Ngày bắt đầu không được sau ngày kết thúc", 400);
  let query = getSupabaseServiceClient().from("audit_logs")
    .select("id, user_id, action, entity_type, entity_id, old_data, new_data, ip_address, created_at, users(full_name, email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  const action = params.get("action");
  const entityType = params.get("entityType");
  if (action?.trim()) query = query.ilike("action", `%${escapeIlikeLiteral(action.trim())}%`);
  if (entityType) query = query.eq("entity_type", entityType);
  if (from) query = query.gte("created_at", new Date(`${params.get("from")}T00:00:00.000+07:00`).toISOString());
  if (to) query = query.lte("created_at", new Date(`${params.get("to")}T23:59:59.999+07:00`).toISOString());
  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);
  return ok({ items: data ?? [], total: count ?? 0, page, pageSize });
}
