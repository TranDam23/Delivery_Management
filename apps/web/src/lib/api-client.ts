"use client";

import type { ApiResponse } from "@delivery/shared";

const TOKEN_KEY = "delivertrust_token";

/**
 * Token JWT do POST /api/auth/login tra ve trong body (khong phai cookie), nen
 * phia trinh duyet tu luu. Man dang nhap thuoc nhom "Tai khoan" cua thanh vien
 * con lai; o day chi doc/ghi token de cac man cua nhom Nguoi gui/nhan goi API.
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Goi API noi bo kem Bearer token, tra thang phan `data` cua ApiResponse. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    throw new ApiError(payload?.error ?? `Lỗi ${response.status}`, response.status);
  }

  return payload.data as T;
}
