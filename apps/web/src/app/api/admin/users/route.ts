import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode, WarehouseStatusCode } from "@delivery/shared";
import { OPERATIONAL_ROLE_CODES, resolveWarehouseAssignment } from "@/lib/admin-user-rules";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest, hashPassword } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

function canManageUsers(roleCode: RoleCode): boolean {
  return roleCode === RoleCode.ADMIN;
}

/** GET /api/admin/users — tài khoản nghiệp vụ và danh mục kho để Admin gán phạm vi. */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageUsers(auth.roleCode)) return fail("Forbidden", 403);

  const supabase = getSupabaseServiceClient();
  const [{ data: users, error: usersError }, { data: warehouses, error: warehousesError }] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, email, phone, province, warehouse_id, status, roles(code, name), warehouses(id, code, name, province, warehouse_level)")
      .order("full_name"),
    supabase
      .from("warehouses")
      .select("id, code, name, province, ward, district, status, warehouse_level, parent_warehouse_id, region_code")
      .eq("status", WarehouseStatusCode.ACTIVE)
      .order("province")
      .order("warehouse_level")
      .order("name"),
  ]);

  if (usersError) return fail(usersError.message, 500);
  if (warehousesError) return fail(warehousesError.message, 500);

  return ok({ users: users ?? [], warehouses: warehouses ?? [] });
}

const createSchema = z.object({
  full_name: z.string().trim().min(2, "Họ tên phải có ít nhất 2 ký tự").max(120),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(255),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(100),
  phone: z.string().trim().regex(/^0d{9}$/, "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0").optional(),
  role_code: z.nativeEnum(RoleCode),
  warehouse_id: z.string().uuid().nullable().optional(),
});

/** POST /api/admin/users — Admin tạo tài khoản (nhân viên giao hàng, điều phối viên, nhân viên kho, admin, khách hàng). */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (!canManageUsers(auth.roleCode)) return fail("Forbidden", 403);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const input = parsed.data;
  if (!OPERATIONAL_ROLE_CODES.includes(input.role_code) && input.warehouse_id) {
    return fail("Chỉ tài khoản vận hành mới được gán kho", 400);
  }
  const assignment = await resolveWarehouseAssignment(input.role_code, input.warehouse_id ?? null);
  if (assignment.error) return fail(assignment.error, assignment.status);

  const supabase = getSupabaseServiceClient();
  const { data: role, error: roleError } = await supabase.from("roles").select("id").eq("code", input.role_code).maybeSingle();
  if (roleError) return fail(roleError.message, 500);
  if (!role) return fail("Vai trò không tồn tại", 400);

  const { data, error } = await supabase.from("users").insert({
    full_name: input.full_name,
    email: input.email,
    password_hash: await hashPassword(input.password),
    phone: input.phone ?? null,
    role_id: role.id,
    status: "active",
    warehouse_id: input.warehouse_id ?? null,
    province: assignment.province,
  }).select("id, full_name, email, phone, province, warehouse_id, status, roles(code, name), warehouses(id, code, name, province, warehouse_level)").single();
  if (error) return fail(error.code === "23505" ? "Email này đã được sử dụng" : error.message, error.code === "23505" ? 409 : 500);

  await writeAuditLog({ userId: auth.userId, action: "USER_CREATED", entityType: "user", entityId: data.id, newData: { email: data.email, role: input.role_code, warehouse_id: input.warehouse_id ?? null }, request });
  return ok(data, 201);
}
