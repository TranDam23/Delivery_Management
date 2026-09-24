import type { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** Danh sách của chính tài khoản đăng nhập; không tin userId từ client. */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const params = request.nextUrl.searchParams;
  const page = Number(params.get("page") ?? "1");
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return fail("Trang không hợp lệ");
  const filter = params.get("filter") ?? "all";
  if (filter !== "all" && filter !== "unread") return fail("Bộ lọc không hợp lệ");

  const supabase = getSupabaseServiceClient();
  const { count: unreadCount, error: countError } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId)
    .eq("is_read", false);
  if (countError) return fail(countError.message, 500);

  const pageSize = 10;
  let query = supabase
    .from("notifications")
    .select("id, order_id, type, title, message, is_read, created_at, read_at", { count: "exact" })
    .eq("user_id", auth.userId);
  if (filter === "unread") query = query.eq("is_read", false);
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return fail(error.message, 500);
  return ok({ items: data ?? [], total: count ?? 0, unreadCount: unreadCount ?? 0, page, pageSize });
}

/** Đánh dấu tất cả thông báo chưa đọc của chính tài khoản. */
export async function PATCH(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  const { error } = await getSupabaseServiceClient()
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", auth.userId)
    .eq("is_read", false);
  if (error) return fail(error.message, 500);
  return ok({ marked: true });
}
