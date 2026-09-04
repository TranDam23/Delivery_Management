import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { hashPassword, signAuthToken } from "@/lib/auth";
import { ok, fail } from "@/lib/api-response";

const registerSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  roleCode: z.enum([RoleCode.CUSTOMER]).default(RoleCode.CUSTOMER),
});

/** Dang ky tai khoan khach hang. Nhan vien/dieu phoi/admin do ADMIN tao. */
export async function POST(request: NextRequest) {
  const parsed = registerSchema.safeParse(await request.json());
  if (!parsed.success) return fail(parsed.error.message);

  const supabase = getSupabaseServiceClient();

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("code", RoleCode.CUSTOMER)
    .single();
  if (roleError || !role) return fail("Role khong ton tai", 500);

  const passwordHash = await hashPassword(parsed.data.password);

  const { data: user, error } = await supabase
    .from("users")
    .insert({
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      password_hash: passwordHash,
      phone: parsed.data.phone ?? null,
      role_id: role.id,
    })
    .select("id, full_name, email, phone")
    .single();

  if (error) return fail(error.message, 409);

  const token = signAuthToken({ userId: user.id, roleCode: RoleCode.CUSTOMER });
  return ok({ token, user }, 201);
}
