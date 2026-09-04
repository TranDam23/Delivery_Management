"use client";

import type { ApiResponse } from "@delivery/shared";

const TOKEN_KEY = "delivertrust_token";
const USER_KEY = "delivertrust_user";

/**
 * Token JWT do POST /api/auth/login tra ve trong body (khong phai cookie), nen
 * phia trinh duyet tu luu. Man dang nhap thuoc nhom "Tai khoan" cua thanh vien
 * con lai; o day chi doc/ghi token de cac man cua nhom Nguoi gui/nhan goi API.
 */
function getStoredValue(key: string): string | null {
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
}

export function getToken(): string | null {
  return getStoredValue(TOKEN_KEY);
}

export function setToken(token: string, remember = true): void {
  const target = remember ? window.localStorage : window.sessionStorage;
  const other = remember ? window.sessionStorage : window.localStorage;

  other.removeItem(TOKEN_KEY);
  target.setItem(TOKEN_KEY, token);
}

export function getStoredUser<T>(): T | null {
  const raw = getStoredValue(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    clearStoredUser();
    return null;
  }
}

export function setStoredUser<T>(user: T, remember = true): void {
  const target = remember ? window.localStorage : window.sessionStorage;
  const other = remember ? window.sessionStorage : window.localStorage;

  other.removeItem(USER_KEY);
  target.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  clearStoredUser();
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
