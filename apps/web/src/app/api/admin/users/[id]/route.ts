import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode, UserStatus } from "@delivery/shared";
import { OPERATIONAL_ROLE_CODES, resolveWarehouseAssignment } from "@/lib/admin-user-rules";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  warehouse_id: z.string().uuid().nullable().optional(),
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.SUSPENDED]).optional(),
  role_code: z.nativeEnum(RoleCode).optional(),
  full_name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^0\d{9}$/, "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0").nullable().optional(),
});

const SELECT = "id, full_name, email, phone, province, warehouse_id, status, roles(code, name), warehouses(id, code, name, province, warehouse_level)";

/**
 * PATCH /api/admin/users/:id — Admin cập nhật tài khoản: gán kho, khóa/mở khóa,
 * đổi vai trò (phân quyền), đổi họ tên/số điện thoại. Mọi thay đổi được ghi audit log.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const input = parsed.data;
  if (Object.keys(input).length === 0) return fail("Không có thay đổi nào");

  const { id } = await params;
  const supabase = getSupabaseServiceClient();
  const { data: target, error: targetError } = await supabase
    .from("users")
    .select("id, full_name, phone, status, warehouse_id, province, role_id, roles(code)")
    .eq("id", id)
    .maybeSingle();
  if (targetError) return fail(targetError.message, 500);
  if (!target) return fail("Không tìm thấy tài khoản", 404);
  const currentRole = (Array.isArray(target.roles) ? target.roles[0] : target.roles)?.code ?? null;
  if (!currentRole) return fail("Tài khoản chưa có vai trò hợp lệ", 409);

  const nextRole: string = input.role_code ?? currentRole;
  const nextStatus = input.status ?? target.status;
  if (id === auth.userId && (nextRole !== RoleCode.ADMIN || nextStatus !== UserStatus.ACTIVE)) {
    return fail("Không thể tự hạ quyền hoặc khóa chính tài khoản đang đăng nhập", 400);
  }
  if (currentRole === RoleCode.ADMIN && (nextRole !== RoleCode.ADMIN || nextStatus !== UserStatus.ACTIVE)) {
    const { count, error: countError } = await supabase.from("users")
      .select("id, roles!inner(code)", { count: "exact", head: true })
      .eq("roles.code", RoleCode.ADMIN).eq("status", UserStatus.ACTIVE).neq("id", id);
    if (countError) return fail(countError.message, 500);
    if ((count ?? 0) === 0) return fail("Phải còn ít nhất một quản trị viên đang hoạt động", 409);
  }

  const update: Record<string, unknown> = {};
  if (input.full_name !== undefined) update.full_name = input.full_name;
  if (input.phone !== undefined) update.phone = input.phone;
  if (input.status !== undefined) update.status = input.status;
  if (input.role_code !== undefined && input.role_code !== currentRole) {
    const { data: role, error: roleError } = await supabase.from("roles").select("id").eq("code", input.role_code).maybeSingle();
    if (roleError) return fail(roleError.message, 500);
    if (!role) return fail("Vai trò không tồn tại", 400);
    update.role_id = role.id;
  }

  const roleChanged = nextRole !== currentRole;
  if (!OPERATIONAL_ROLE_CODES.includes(nextRole)) {
    if (input.warehouse_id) return fail("Chỉ tài khoản điều phối viên, nhân viên giao nhận hoặc nhân viên kho mới được gán kho", 400);
    if (target.warehouse_id || target.province) { update.warehouse_id = null; update.province = null; }
  } else if (input.warehouse_id !== undefined || roleChanged) {
    // Đổi vai trò thì kho cũ có thể không còn hợp lệ: kiểm tra lại, sai thì bỏ gán.
    const warehouseId = input.warehouse_id !== undefined ? input.warehouse_id : target.warehouse_id;
    const assignment = await resolveWarehouseAssignment(nextRole, warehouseId);
    if (assignment.error) {
      if (input.warehouse_id !== undefined) return fail(assignment.error, assignment.status);
      update.warehouse_id = null;
      update.province = null;
    } else {
      update.warehouse_id = warehouseId;
      update.province = assignment.province;
    }
  }

  const { data, error } = await supabase.from("users").update(update as never).eq("id", id).select(SELECT).single();
  if (error) return fail(error.message, 500);

  if (input.status !== undefined && input.status !== UserStatus.ACTIVE) {
    await supabase.from("refresh_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", id).is("revoked_at", null);
  }
  await writeAuditLog({
    userId: auth.userId,
    action: roleChanged ? "USER_ROLE_CHANGED" : input.status !== undefined ? "USER_STATUS_CHANGED" : "USER_UPDATED",
    entityType: "user",
    entityId: id,
    oldData: { role: currentRole, status: target.status, warehouse_id: target.warehouse_id, full_name: target.full_name, phone: target.phone },
    newData: { role: nextRole, status: nextStatus, ...update, role_id: undefined },
    request,
  });
  return ok(data);
}
