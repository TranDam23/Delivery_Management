import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import type { AuthTokenPayload } from "@delivery/shared";

// Dinh nghia goc nam o packages/shared de mobile dung chung. Re-export cho
// code cu trong apps/web van import tu day duoc.
export type { AuthTokenPayload };

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET env var");
  return secret;
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, 10);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
}

/** Doc va xac thuc Bearer token tu header Authorization cua request (dung boi web + mobile). */
export function getAuthFromRequest(request: NextRequest): AuthTokenPayload | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  try {
    return verifyAuthToken(header.slice("Bearer ".length));
  } catch {
    return null;
  }
}
