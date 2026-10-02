import { z } from "zod";
import type { RegisterOtpReqBody, RegisterReqBody } from "@/requests/auth.requests";

const phonePattern = /^\+?[0-9\s().-]{9,20}$/;

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(1, "full_name is required").max(120),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("email must be a valid email address")
      .max(254),
    password: z
      .string()
      .min(8, "password must be at least 8 characters")
      .regex(/[A-Z]/, "password must contain an uppercase letter")
      .regex(/[a-z]/, "password must contain a lowercase letter")
      .regex(/[0-9]/, "password must contain a number"),
    confirm_password: z.string().min(1, "confirm_password is required"),
    otp: z.string().trim().regex(/^\d{6,8}$/, "otp must contain 6 to 8 digits"),
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

export const registerOtpSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("email must be a valid email address")
      .max(254),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email("email must be a valid email address"),
    password: z.string().min(1, "password is required"),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "currentPassword is required"),
    newPassword: z
      .string()
      .min(8, "newPassword must be at least 8 characters")
      .regex(/[A-Z]/, "newPassword must contain an uppercase letter")
      .regex(/[a-z]/, "newPassword must contain a lowercase letter")
      .regex(/[0-9]/, "newPassword must contain a number"),
    confirmPassword: z.string().min(1, "confirmPassword is required"),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("email must be a valid email address")
      .max(254),
  })
  .strict();

export const verifyPasswordRecoveryOtpSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("email must be a valid email address")
      .max(254),
    otp: z.string().trim().regex(/^\d{6,8}$/, "otp must contain 6 to 8 digits"),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "newPassword must be at least 8 characters")
      .regex(/[A-Z]/, "newPassword must contain an uppercase letter")
      .regex(/[a-z]/, "newPassword must contain a lowercase letter")
      .regex(/[0-9]/, "newPassword must contain a number"),
    confirmPassword: z.string().min(1, "confirmPassword is required"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "confirmPassword must match newPassword",
      });
    }
  });

export const updateUserProfileSchema = z
  .object({
    fullName: z.string().trim().min(1, "fullName must not be empty").optional(),
    phone: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.fullName !== undefined ||
      value.phone !== undefined ||
      value.avatar !== undefined,
    { message: "At least one profile field is required" },
  );

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

export type RegisterOtpValidationResult =
  | { success: true; data: RegisterOtpReqBody }
  | { success: false; error: string };

export function validateRegisterOtpInput(
  body: unknown,
): RegisterOtpValidationResult {
  const result = registerOtpSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };

  const message = result.error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
  return { success: false, error: `Validation failed: ${message}` };
}

export type LoginValidationResult =
  | { success: true; data: import("@/requests/auth.requests").LoginReqBody }
  | { success: false; error: string };

export function validateLoginInput(body: unknown): LoginValidationResult {
  const result = loginSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };

  const message = result.error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
  return { success: false, error: `Validation failed: ${message}` };
}

export type ChangePasswordValidationResult =
  | {
      success: true;
      data: import("@/requests/auth.requests").ChangePasswordReqBody;
    }
  | { success: false; error: string };

export function validateChangePasswordInput(
  body: unknown,
): ChangePasswordValidationResult {
  const result = changePasswordSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };

  const message = result.error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
  return { success: false, error: `Validation failed: ${message}` };
}

export type ForgotPasswordValidationResult =
  | {
      success: true;
      data: import("@/requests/auth.requests").ForgotPasswordReqBody;
    }
  | { success: false; error: string };

export function validateForgotPasswordInput(
  body: unknown,
): ForgotPasswordValidationResult {
  const result = forgotPasswordSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };

  const message = result.error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
  return { success: false, error: `Validation failed: ${message}` };
}

export type VerifyPasswordRecoveryOtpValidationResult =
  | {
      success: true;
      data: import("@/requests/auth.requests").VerifyPasswordRecoveryOtpReqBody;
    }
  | { success: false; error: string };

export function validateVerifyPasswordRecoveryOtpInput(
  body: unknown,
): VerifyPasswordRecoveryOtpValidationResult {
  const result = verifyPasswordRecoveryOtpSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };

  const message = result.error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
  return { success: false, error: `Validation failed: ${message}` };
}

export type ResetPasswordValidationResult =
  | {
      success: true;
      data: import("@/requests/auth.requests").ResetPasswordReqBody;
    }
  | { success: false; error: string };

export function validateResetPasswordInput(
  body: unknown,
): ResetPasswordValidationResult {
  const result = resetPasswordSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };

  const message = result.error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
  return { success: false, error: `Validation failed: ${message}` };
}

export type UpdateUserProfileValidationResult =
  | {
      success: true;
      data: import("@/requests/auth.requests").UpdateUserProfileReqBody;
    }
  | { success: false; error: string };

export function validateUpdateUserProfileInput(
  body: unknown,
): UpdateUserProfileValidationResult {
  const result = updateUserProfileSchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };

  const message = result.error.issues
    .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
    .join("; ");
  return { success: false, error: `Validation failed: ${message}` };
}

export function validateAuthorizationHeader(
  header: string | null,
): { success: true; token: string } | { success: false; error: string } {
  if (!header) {
    return { success: false, error: "Authorization header is required" };
  }

  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (!match?.[1]) {
    return {
      success: false,
      error: "Authorization header must use the Bearer token format",
    };
  }

  return { success: true, token: match[1] };
}
