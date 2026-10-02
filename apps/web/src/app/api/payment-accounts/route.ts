import type { NextRequest } from "next/server";
import { z } from "zod";
import { RoleCode } from "@delivery/shared";
import { writeAuditLog } from "@/lib/audit";
import { getAuthFromRequest } from "@/lib/auth";
import { fail, ok } from "@/lib/api-response";
import { findBank, normalizeAccountName } from "@/lib/banks";
import { isOwnCloudinaryImage } from "@/lib/cloudinary";
import { PAYMENT_ACCOUNT_FIELDS, type PaymentAccount, type PaymentMethodAvailability } from "@/lib/payment-accounts";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const createSchema = z.object({
  kind: z.enum(["bank", "momo"]),
  account_name: z.string().trim().min(2).max(100),
  account_number: z.string().trim().min(1).max(40),
  bank_bin: z.string().trim().optional(),
  qr_image_url: z.string().url().optional(),
  note: z.string().trim().max(300).optional(),
  activate: z.boolean().default(false),
});

/**
 * GET /api/payment-accounts — Admin xem toàn bộ tài khoản nhận tiền.
 * GET /api/payment-accounts?available=1 — mọi tài khoản đăng nhập chỉ biết
 * phương thức nào đang bật, không thấy số tài khoản.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  const supabase = getSupabaseServiceClient();

  if (request.nextUrl.searchParams.get("available") === "1") {
    const { data, error } = await supabase.from("payment_accounts").select("kind").eq("is_active", true);
    if (error) return fail(error.message, 500);
    const kinds = new Set((data ?? []).map((row) => row.kind));
    const availability: PaymentMethodAvailability = { vietqr: kinds.has("bank"), momo: kinds.has("momo") };
    return ok(availability);
  }

  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);
  const { data, error } = await supabase
    .from("payment_accounts")
    .select(PAYMENT_ACCOUNT_FIELDS)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return fail(error.message, 500);
  return ok((data ?? []) as PaymentAccount[]);
}

/** POST /api/payment-accounts — Admin thêm tài khoản ngân hàng hoặc ví MoMo. */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);
  if (auth.roleCode !== RoleCode.ADMIN) return fail("Forbidden", 403);

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Thông tin tài khoản không hợp lệ", 400);
  const input = parsed.data;

  const accountName = normalizeAccountName(input.account_name);
  if (accountName.length < 2) return fail("Nhập tên chủ tài khoản", 400);
  const accountNumber = input.account_number.replace(/[\s.-]+/g, "");

  let row: Record<string, unknown>;
  if (input.kind === "bank") {
    const bank = findBank(input.bank_bin ?? "");
    if (!bank) return fail("Chọn ngân hàng trong danh sách", 400);
    if (!/^[0-9A-Za-z]{4,30}$/.test(accountNumber)) return fail("Số tài khoản dài 4–30 ký tự, chỉ gồm chữ và số", 400);
    row = { kind: "bank", bank_bin: bank.bin, bank_code: bank.code, bank_name: bank.name, account_number: accountNumber, account_name: accountName };
  } else {
    if (!/^0[0-9]{9}$/.test(accountNumber)) return fail("Số điện thoại MoMo gồm 10 chữ số, bắt đầu bằng 0", 400);
    if (!input.qr_image_url) return fail("Tải lên ảnh mã QR nhận tiền lấy từ app MoMo", 400);
    if (!isOwnCloudinaryImage(input.qr_image_url)) return fail("Ảnh QR phải được tải lên qua hệ thống", 400);
    row = { kind: "momo", bank_bin: null, bank_code: "MOMO", bank_name: "Ví MoMo", account_number: accountNumber, account_name: accountName, qr_image_url: input.qr_image_url };
  }

  const supabase = getSupabaseServiceClient();
  if (input.activate) {
    const { error: deactivateError } = await supabase.from("payment_accounts").update({ is_active: false }).eq("kind", input.kind).eq("is_active", true);
    if (deactivateError) return fail(deactivateError.message, 500);
  }
  const { data, error } = await supabase
    .from("payment_accounts")
    .insert({ ...row, note: input.note ?? "", is_active: input.activate } as never)
    .select(PAYMENT_ACCOUNT_FIELDS)
    .single();
  if (error) {
    if (error.code === "23505") return fail(input.kind === "momo" ? "Ví MoMo này đã có trong danh sách" : "Tài khoản này đã có trong danh sách", 409);
    return fail(error.message, 500);
  }
  await writeAuditLog({ userId: auth.userId, action: "PAYMENT_ACCOUNT_CREATED", entityType: "payment_account", entityId: (data as PaymentAccount).id, newData: { kind: input.kind, account_number: accountNumber, is_active: input.activate }, request });
  return ok(data as PaymentAccount, 201);
}
