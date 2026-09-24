import type { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fail("Thông báo không hợp lệ");
  }
  const { data, error } = await getSupabaseServiceClient()
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .eq("is_read", false)
    .select("id")
    .maybeSingle();
  if (error) return fail(error.message, 500);
  // Idempotent only for owned notifications; do not reveal other users' rows.
  if (!data) {
    const { data: owned, error: lookupError } = await getSupabaseServiceClient()
      .from("notifications").select("id").eq("id", id).eq("user_id", auth.userId).maybeSingle();
    if (lookupError) return fail(lookupError.message, 500);
    if (!owned) return fail("Không tìm thấy thông báo", 404);
  }
  return ok({ marked: true });
}
