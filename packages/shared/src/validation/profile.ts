import { z } from "zod";
import { normalizePhone } from "./contact";

const optionalPhoneSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .trim()
    .transform(normalizePhone)
    .refine(
      (value) => /^0\d{9}$/.test(value),
      "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0",
    )
    .nullable()
    .optional(),
);

/** Các trường cá nhân được phép cập nhật; role/permission không nằm trong schema này. */
export const updateProfileSchema = z
  .object({
    full_name: z.string().trim().min(2, "Họ tên phải có ít nhất 2 ký tự").max(120, "Họ tên quá dài").optional(),
    email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(255, "Email quá dài").optional(),
    phone: optionalPhoneSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Chưa có thông tin nào để cập nhật");

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Dữ liệu đổi mật khẩu, không cho phép gửi role hoặc các trường tài khoản khác. */
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(6, "Mật khẩu hiện tại phải có ít nhất 6 ký tự").max(72),
    new_password: z.string().min(6, "Mật khẩu mới phải có ít nhất 6 ký tự").max(72),
    confirm_password: z.string().min(6, "Vui lòng xác nhận mật khẩu mới").max(72),
  })
  .refine((value) => value.new_password === value.confirm_password, {
    path: ["confirm_password"],
    message: "Mật khẩu xác nhận không khớp",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
