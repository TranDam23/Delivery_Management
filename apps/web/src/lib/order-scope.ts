import type { AuthTokenPayload } from "@delivery/shared";
import { getVisibleOrderIds } from "@/lib/order-access";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Shares the order visibility policy with order list/detail/QR endpoints.
 * Kept as a compatibility wrapper for COD, alerts, and statistics callers.
 */
export async function scopedOrderIds(auth: AuthTokenPayload) {
  return getVisibleOrderIds(getSupabaseServiceClient(), auth);
}
