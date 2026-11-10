import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { DEFAULT_DAILY_LIMIT, loadShipperCapacities, SHIPPER_LIMIT_SETTING } from "@/lib/shipper-capacity";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  shipper_type: z.enum(["PICKUP", "DELIVERY", "BOTH"]).optional(),
  /** null = dùng giới hạn mặc định của hệ thống. */
  daily_assignment_limit: z.number().int().min(1).max(500).nullable().optional(),
}).refine((value) => value.shipper_type !== undefined || value.daily_assignment_limit !== undefined, "Không có thay đổi nào");

async function loadShipper(id: string): Promise<{ id: string; full_name: string } | { error: string; status: number }> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from("users").select("id, full_name, roles(code)").eq("id", id).maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: "Không tìm thấy tài khoản", status: 404 };
  const role = Array.isArray(data.roles) ? data.roles[0]?.code : data.roles?.code;
  if (role !== RoleCode.DELIVERY_STAFF) return { error: "Chỉ nhân viên giao hàng mới có cấu hình shipper", status: 400 };
  return { id: data.id, full_name: data.full_name };
}

async function profileResponse(id: string) {
  const supabase = getSupabaseServiceClient();
  const capacity = (await loadShipperCapacities([id])).get(id);
  const { data: setting } = await supabase.from("system_settings").select("value").eq("key", SHIPPER_LIMIT_SETTING).maybeSingle();
  const defaultLimit = Number(setting?.value);
  const { data: raw } = await supabase.from("users").select("daily_assignment_limit").eq("id", id).maybeSingle();
  return {
    shipper_type: capacity?.shipperType ?? "BOTH",
    daily_assignment_limit: raw?.daily_assignment_limit ?? null,
    default_limit: Number.isInteger(defaultLimit) && defaultLimit > 0 ? defaultLimit : DEFAULT_DAILY_LIMIT,
    effective_limit: capacity?.dailyLimit ?? DEFAULT_DAILY_LIMIT,
    assigned_today: capacity?.assignedToday ?? 0,
  };
}

/** GET /api/admin/users/:id/shipper-profile — loại shipper, giới hạn đơn mỗi ngày và số đơn hôm nay (Admin). */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);
  const { id } = await params;
  const shipper = await loadShipper(id);
  if ("error" in shipper) return fail(shipper.error, shipper.status);
  return ok(await profileResponse(id));
}

/** PATCH /api/admin/users/:id/shipper-profile — đổi loại shipper hoặc giới hạn đơn mỗi ngày (Admin). */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Cấu hình shipper không hợp lệ (giới hạn từ 1 đến 500 đơn mỗi ngày)", 400);
  const shipper = await loadShipper(id);
  if ("error" in shipper) return fail(shipper.error, shipper.status);

  const before = await profileResponse(id);
  const { error } = await getSupabaseServiceClient().from("users").update(parsed.data).eq("id", id);
  if (error) {
    // Chưa chạy migration: thiếu cột shipper_type/daily_assignment_limit.
    if (error.code === "42703" || error.message.includes("shipper_type") || error.message.includes("daily_assignment_limit")) {
      return fail("Cơ sở dữ liệu chưa có cấu hình shipper (cần chạy migration shipper_capacity)", 503);
    }
    return fail(error.message, 500);
  }
  const after = await profileResponse(id);
  await writeAuditLog({ userId: auth.userId, action: "SHIPPER_PROFILE_UPDATE", entityType: "user", entityId: id, oldData: before, newData: after, request });
  return ok(after);
}
