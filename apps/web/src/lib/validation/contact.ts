import { z } from "zod";
import { ContactType } from "@delivery/shared";

/**
 * Chuan hoa so dien thoai truoc khi luu. Bat buoc, khong phai tien ich:
 * unique index (user_id, phone) chi chan duoc trung khi moi noi deu ghi cung
 * mot dang chuoi — "0908 123 456", "+84908123456" va "0908123456" la mot nguoi.
 */
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/[\s.\-()]/g, "");
  if (digitsOnly.startsWith("+84")) return "0" + digitsOnly.slice(3);
  if (digitsOnly.startsWith("84") && digitsOnly.length === 11) return "0" + digitsOnly.slice(2);
  return digitsOnly;
}

const phoneSchema = z
  .string()
  .min(1, "Số điện thoại là bắt buộc")
  .transform(normalizePhone)
  .refine((value) => /^0\d{9}$/.test(value), "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0");

/** Email khong bat buoc: nguoi nhan thuong chi co so dien thoai. */
const optionalEmailSchema = z
  .string()
  .trim()
  .email("Email không hợp lệ")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const createContactSchema = z.object({
  type: z.nativeEnum(ContactType),
  name: z.string().trim().min(2, "Họ tên phải có ít nhất 2 ký tự").max(120),
  phone: phoneSchema,
  email: optionalEmailSchema,
});

export const updateContactSchema = createContactSchema.partial();

export const listContactsQuerySchema = z.object({
  q: z.string().trim().optional(),
  /** Loc theo vai tro dung duoc: 'sender' tra ve ca lien he 'both'. */
  type: z.nativeEnum(ContactType).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateContactBody = z.infer<typeof createContactSchema>;
export type UpdateContactBody = z.infer<typeof updateContactSchema>;
