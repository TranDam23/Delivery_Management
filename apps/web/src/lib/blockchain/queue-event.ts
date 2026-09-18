import { after } from "next/server";
import { BlockchainTransactionStatus, type BlockchainEventType } from "@delivery/shared";
import type { Json } from "@delivery/database";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { actorAddressForUser, hashEventPayload, recordDeliveryEventOnChain } from "./record-event";

export interface QueueBlockchainEventParams {
  orderId: string;
  trackingCode: string;
  eventType: BlockchainEventType;
  /** users.id của người thực hiện nghiệp vụ. */
  performedBy: string;
  /** Dữ liệu nghiệp vụ của mốc; được lưu nguyên văn và băm để ghi lên chain. */
  payload: Record<string, unknown>;
}

// Các giao dịch dùng chung một ví operator; gửi song song sẽ tranh nonce.
let chainQueue: Promise<void> = Promise.resolve();

function isBlockchainWriteEnabled(): boolean {
  // Tắt mặc định cho tới GĐ5 Blockchain; bật bằng BLOCKCHAIN_WRITE_ENABLED=true.
  return process.env.BLOCKCHAIN_WRITE_ENABLED === "true";
}

/**
 * Ghi mốc vào blockchain_events với tx_status = pending rồi gửi giao dịch sau
 * khi API đã trả response. Confirm trên Amoy mất vài giây nên không được chặn
 * luồng nghiệp vụ; lỗi chain chỉ đánh dấu failed để xử lý lại, không làm hỏng
 * thao tác giao nhận đã lưu.
 */
export async function queueBlockchainEvent(params: QueueBlockchainEventParams): Promise<void> {
  if (!isBlockchainWriteEnabled()) return;

  const supabase = getSupabaseServiceClient();
  const { payload, hash } = hashEventPayload({
    ...params.payload,
    orderId: params.orderId,
    trackingCode: params.trackingCode,
    eventType: params.eventType,
    performedBy: params.performedBy,
  });

  const { data: row, error } = await supabase
    .from("blockchain_events")
    .insert({
      order_id: params.orderId,
      event_type: params.eventType,
      event_data_hash: hash,
      event_payload: payload as Json,
      performed_by: params.performedBy,
      tx_status: BlockchainTransactionStatus.PENDING,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("queueBlockchainEvent insert failed", error);
    return;
  }

  const job = async (): Promise<void> => {
    const client = getSupabaseServiceClient();
    try {
      const result = await recordDeliveryEventOnChain({
        trackingCode: params.trackingCode,
        eventType: params.eventType,
        performedByAddress: actorAddressForUser(params.performedBy),
        eventDataHash: hash,
      });
      await client
        .from("blockchain_events")
        .update({
          tx_status: BlockchainTransactionStatus.CONFIRMED,
          transaction_hash: result.transactionHash,
          block_number: result.blockNumber,
          chain_timestamp: result.chainTimestamp,
        })
        .eq("id", row.id);
    } catch (chainError) {
      console.error("recordDeliveryEventOnChain failed", { eventId: row.id, chainError });
      await client
        .from("blockchain_events")
        .update({ tx_status: BlockchainTransactionStatus.FAILED })
        .eq("id", row.id);
    }
  };

  chainQueue = chainQueue.then(job, job);
  after(() => chainQueue);
}
