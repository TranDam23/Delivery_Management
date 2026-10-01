import { z } from "zod";

export const guestEmailSchema = z.string().trim().toLowerCase().email().max(254);
export const guestPhoneSchema = z.string().regex(/^0\d{9}$/, "Số điện thoại phải có 10 chữ số và bắt đầu bằng 0.");
const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: guestPhoneSchema,
  addressLine: z.string().trim().min(3).max(300),
  province: z.string().trim().min(2).max(100),
  district: z.string().trim().max(100),
  ward: z.string().trim().min(2).max(100),
});

export const guestOrderSchema = z.object({
  email: guestEmailSchema,
  otp: z.string().trim().regex(/^\d{6,8}$/, "Mã OTP không hợp lệ."),
  sender: addressSchema,
  receiver: addressSchema.extend({ email: guestEmailSchema }),
  serviceType: z.enum(["standard", "express", "same_day"]),
  codAmount: z.number().finite().nonnegative().max(1000000000),
  note: z.string().trim().max(1000),
  item: z.object({
    name: z.string().trim().min(1).max(200),
    type: z.string().trim().max(100),
    quantity: z.number().int().positive().max(10000),
    weight: z.number().finite().positive().max(10000).nullable(),
    declaredValue: z.number().finite().nonnegative().max(1000000000).nullable(),
    note: z.string().trim().max(1000),
  }),
});

export const guestLookupSchema = z.object({
  email: guestEmailSchema,
  phone: guestPhoneSchema.optional(),
  otp: z.string().trim().regex(/^\d{6,8}$/).optional(),
  lookupToken: z.string().max(2000).optional(),
  page: z.number().int().positive().max(10000).default(1),
}).refine((value) => Boolean(value.otp || value.lookupToken), "Cần OTP email để tra cứu.");

export const GUEST_SERVICE_FEES = { standard: 30000, express: 50000, same_day: 70000 } as const;
