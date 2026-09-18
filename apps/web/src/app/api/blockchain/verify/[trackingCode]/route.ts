import type { NextRequest } from "next/server";
import { BlockchainTransactionStatus } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getBlockchainReadOnlyContract } from "@/lib/blockchain/provider";
import { hashEventPayload } from "@/lib/blockchain/record-event";
import { ok, fail } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ trackingCode: string }>;
}

interface DbBlockchainEvent {
  event_type: string;
  event_data_hash: string;
  event_payload: unknown;
  transaction_hash: string | null;
  block_number: number | null;
  tx_status: string;
  created_at: string;
}

/**
 * GET /api/blockchain/verify/:trackingCode — doi chieu du lieu Supabase voi
 * du lieu ghi tren smart contract DeliveryTracking de xac minh tinh toan
 * ven cua hanh trinh don hang (dung khi co tranh chap).
 *
 * Moi moc da confirmed duoc kiem tra 2 lop: payload luu trong DB bam lai
 * phai ra dung event_data_hash, va hash do phai ton tai tren chain.
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

  const { data: dbEventRows, error: dbError } = await supabase
    .from("blockchain_events")
    .select("event_type, event_data_hash, event_payload, transaction_hash, block_number, tx_status, created_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  if (dbError) return fail(dbError.message, 500);
  const dbEvents = (dbEventRows ?? []) as DbBlockchainEvent[];

  try {
    const contract = getBlockchainReadOnlyContract();
    const onChainEvents = (await contract.getEvents(trackingCode)).map((e) => ({
      eventType: e.eventType,
      performedBy: e.performedBy,
      eventDataHash: e.eventDataHash.toLowerCase(),
      timestamp: Number(e.timestamp),
    }));
    const onChainHashes = new Set(onChainEvents.map((e) => e.eventDataHash));

    const events = dbEvents.map((event) => {
      const payloadHashMatches = event.event_payload && typeof event.event_payload === "object"
        ? hashEventPayload(event.event_payload as Record<string, unknown>).hash === event.event_data_hash
        : null;
      const onChain = onChainHashes.has(event.event_data_hash.toLowerCase());
      return {
        ...event,
        payload_hash_matches: payloadHashMatches,
        on_chain: onChain,
        verified: event.tx_status === BlockchainTransactionStatus.CONFIRMED && onChain && payloadHashMatches !== false,
      };
    });
    const confirmed = events.filter((event) => event.tx_status === BlockchainTransactionStatus.CONFIRMED);

    return ok({
      trackingCode,
      dbEvents: events,
      onChainEvents,
      pendingCount: events.filter((event) => event.tx_status === BlockchainTransactionStatus.PENDING).length,
      failedCount: events.filter((event) => event.tx_status === BlockchainTransactionStatus.FAILED).length,
      matched: confirmed.every((event) => event.verified) && confirmed.length === onChainEvents.length,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Blockchain query failed", 502);
  }
}
