import { z } from "zod";
import { addressGeoFields, refineCoordinatePair } from "./geo";

const addressFields = z.object({
  recipient_name: z.string().trim().min(1, "Tên người nhận không được để trống"),
  phone: z.string().trim().regex(/^0\d{9}$/, "Số điện thoại phải có 10 chữ số và bắt đầu bằng 0"),
  address_line: z.string().trim().min(1, "Địa chỉ cụ thể không được để trống"),
  ward: z.string().trim().min(1, "Phường/Xã không được để trống"),
  /** Quận/huyện giữ để tương thích dữ liệu cũ; không bắt buộc với dữ liệu 2 cấp. */
  district: z.string().trim().optional().default(""),
  province: z.string().trim().min(1, "Tỉnh/Thành phố không được để trống"),
  is_default: z.boolean().default(false),
  ...addressGeoFields,
});

/** Payload dùng chung cho màn tạo địa chỉ và API addresses. */
export const createAddressSchema = addressFields.superRefine(refineCoordinatePair);

export const updateAddressSchema = addressFields.partial().superRefine(refineCoordinatePair);

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
