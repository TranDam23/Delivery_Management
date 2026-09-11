import { z } from "zod";
import type { RegisterReqBody } from "@/requests/auth.requests";

const phonePattern = /^\+?[0-9\s().-]{9,20}$/;

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(1, "full_name is required").max(120),
    email: z.string().trim().email("email must be a valid email address"),
    password: z
      .string()
      .min(8, "password must be at least 8 characters")
      .regex(/[A-Z]/, "password must contain an uppercase letter")
      .regex(/[a-z]/, "password must contain a lowercase letter")
      .regex(/[0-9]/, "password must contain a number"),
    confirm_password: z.string().min(1, "confirm_password is required"),
    phone: z
      .string()
      .trim()
      .refine((value) => value === "" || phonePattern.test(value), {
        message: "phone must be a valid phone number",
      })
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.password !== value.confirm_password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm_password"],
        message: "confirm_password must match password",
      });
    }
  });

export type RegisterValidationResult =
  | { success: true; data: RegisterReqBody }
  | { success: false; error: string };

export function validateRegisterInput(body: unknown): RegisterValidationResult {
  const result = registerSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };

  const message = result.error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
  return { success: false, error: `Validation failed: ${message}` };
}
