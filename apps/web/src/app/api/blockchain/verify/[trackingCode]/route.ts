import type { NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getBlockchainReadOnlyContract } from "@/lib/blockchain/provider";
import { ok, fail } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ trackingCode: string }>;
}

/**
 * GET /api/blockchain/verify/:trackingCode — doi chieu du lieu Supabase voi
 * du lieu ghi tren smart contract DeliveryTracking de xac minh tinh toan
 * ven cua hanh trinh don hang (dung khi co tranh chap).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { trackingCode } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("tracking_code", trackingCode)
    .maybeSingle();
  if (!order) return fail("Khong tim thay don hang", 404);

  const { data: dbEvents } = await supabase
    .from("blockchain_events")
    .select("event_type, event_data_hash, transaction_hash, block_number, created_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  try {
    const contract = getBlockchainReadOnlyContract();
    const onChainEvents = await contract.getEvents(trackingCode);

    return ok({
      trackingCode,
      dbEvents: dbEvents ?? [],
      onChainEvents: onChainEvents.map(
        (e: {
          eventType: string;
          performedBy: string;
          eventDataHash: string;
          timestamp: bigint;
        }) => ({
          eventType: e.eventType,
          performedBy: e.performedBy,
          eventDataHash: e.eventDataHash,
          timestamp: Number(e.timestamp),
        }),
      ),
      matched: (dbEvents ?? []).length === onChainEvents.length,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Blockchain query failed", 502);
  }
}
