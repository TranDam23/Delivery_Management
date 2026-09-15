import { z } from "zod";

/** Payload dùng chung cho màn tạo địa chỉ và API addresses. */
export const createAddressSchema = z.object({
  recipient_name: z.string().trim().min(1, "Tên người nhận không được để trống"),
  phone: z.string().trim().regex(/^0\d{9}$/, "Số điện thoại phải có 10 chữ số và bắt đầu bằng 0"),
  address_line: z.string().trim().min(1, "Địa chỉ cụ thể không được để trống"),
  ward: z.string().trim().optional(),
  district: z.string().trim().optional(),
  province: z.string().trim().optional(),
  is_default: z.boolean().default(false),
});

export const updateAddressSchema = createAddressSchema.partial();

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
