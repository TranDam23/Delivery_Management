import { NextResponse } from "next/server";
import type { ApiResponse } from "@delivery/shared";

export function ok<T>(data: T, init?: number): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status: init ?? 200 });
}

export function fail(error: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error }, { status });
}
