import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";

const assignSchema = z.object({
  order_id: z.string().uuid(),
  delivery_staff_id: z.string().uuid(),
  is_return: z.boolean().default(false),
});

/** POST /api/deliveries — dieu phoi vien phan cong nhan vien giao hang cho don. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN && auth.roleCode !== RoleCode.DISPATCHER) {
    return fail("Forbidden", 403);
  }

  const parsed = assignSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const supabase = getSupabaseServiceClient();
  const { data: delivery, error } = await supabase
    .from("deliveries")
    .insert({
      order_id: parsed.data.order_id,
      delivery_staff_id: parsed.data.delivery_staff_id,
      assigned_by: auth.userId,
      is_return: parsed.data.is_return,
    })
    .select("*")
    .single();

  if (error) return fail(error.message, 500);
  return ok(delivery, 201);
}
