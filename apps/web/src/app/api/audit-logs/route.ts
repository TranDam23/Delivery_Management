import type { NextRequest } from "next/server";
import { RoleCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** GET /api/audit-logs — Admin xem lịch sử thao tác quan trọng (lọc theo hành động, thực thể, thời gian). */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = 30;
  let query = getSupabaseServiceClient().from("audit_logs")
    .select("id, user_id, action, entity_type, entity_id, old_data, new_data, ip_address, created_at, users(full_name, email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  const action = params.get("action");
  const entityType = params.get("entityType");
  const from = params.get("from");
  const to = params.get("to");
  if (action) query = query.ilike("action", `%${action.replace(/[%,]/g, "")}%`);
  if (entityType) query = query.eq("entity_type", entityType);
  if (from && !Number.isNaN(Date.parse(from))) query = query.gte("created_at", new Date(`${from}T00:00:00.000+07:00`).toISOString());
  if (to && !Number.isNaN(Date.parse(to))) query = query.lte("created_at", new Date(`${to}T23:59:59.999+07:00`).toISOString());
  const { data, error, count } = await query;
  if (error) return fail(error.message, 500);
  return ok({ items: data ?? [], total: count ?? 0, page, pageSize });
}
