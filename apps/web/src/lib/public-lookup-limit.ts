import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** Database-backed throttle shared by all server instances. */
export async function takePublicLookupSlot(
  request: NextRequest,
  options: { scope?: string; limit?: number; windowSeconds?: number; subject?: string } = {},
): Promise<"allowed" | "limited" | "unavailable"> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return "unavailable";

  // The hosting proxy must set this header; an absent address shares a single
  // conservative bucket rather than bypassing the limit.
  const clientAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
  const clientKey = createHmac("sha256", secret).update(`public-lookup:${options.scope ?? "tracking"}:${clientAddress}`).digest("hex");

  const { data, error } = await getSupabaseServiceClient().rpc("take_public_tracking_slot", {
    p_client_key: clientKey,
    p_limit: options.limit ?? 30,
    p_window_seconds: options.windowSeconds ?? 60,
  });
  if (error) return "unavailable";
  if (!data) return "limited";
  if (options.subject) {
    const subjectKey = createHmac("sha256", secret)
      .update(`public-lookup:${options.scope ?? "tracking"}:subject:${options.subject.trim().toLowerCase()}`)
      .digest("hex");
    const subjectSlot = await getSupabaseServiceClient().rpc("take_public_tracking_slot", {
      p_client_key: subjectKey,
      p_limit: options.limit ?? 30,
      p_window_seconds: options.windowSeconds ?? 60,
    });
    if (subjectSlot.error) return "unavailable";
    if (!subjectSlot.data) return "limited";
  }
  return "allowed";
}
