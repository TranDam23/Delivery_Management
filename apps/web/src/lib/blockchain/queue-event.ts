import { after } from "next/server";
import { BlockchainTransactionStatus, type BlockchainEventType } from "@delivery/shared";
import type { Json } from "@delivery/database";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  actorAddressForUser,
  BlockchainTransactionHashPersistenceError,
  BlockchainTransactionOutcomeUnknownError,
  BlockchainTransactionRevertedError,
  hashEventPayload,
  onChainEventIdFromDatabaseUuid,
  recordDeliveryEventOnChain,
} from "./record-event";

export interface QueueBlockchainEventParams {
  orderId: string;
  trackingCode: string;
  eventType: BlockchainEventType;
  /** users.id của người thực hiện nghiệp vụ. */
  performedBy: string;
  /** Dữ liệu nghiệp vụ của mốc; được lưu nguyên văn và băm để ghi lên chain. */
  payload: Record<string, unknown>;
}

export type QueueBlockchainEventResult =
  | { status: "queued"; eventId: string }
  | { status: "disabled" }
  | { status: "enqueue_failed"; error: string };

// Các giao dịch dùng chung một ví operator; gửi song song sẽ tranh nonce.
let chainQueue: Promise<void> = Promise.resolve();

export function isBlockchainWriteEnabled(): boolean {
  // Tắt mặc định cho tới GĐ5 Blockchain; bật bằng BLOCKCHAIN_WRITE_ENABLED=true.
  return process.env.BLOCKCHAIN_WRITE_ENABLED === "true";
}

export interface DispatchBlockchainEventParams {
  eventId: string;
  trackingCode: string;
  eventType: BlockchainEventType;
  performedBy: string;
  eventDataHash: string;
}

/**
 * Dispatches an event that has already been durably inserted into
 * blockchain_events (for example by a database transaction).
 */
export async function dispatchBlockchainEvent(
  params: DispatchBlockchainEventParams,
): Promise<boolean> {
  if (!isBlockchainWriteEnabled()) return false;

  const job = async (): Promise<void> => {
    try {
      const client = getSupabaseServiceClient();
      const performedByAddress = actorAddressForUser(params.performedBy);
      onChainEventIdFromDatabaseUuid(params.eventId);
      const { data: claimedRow, error: claimError } = await client
        .from("blockchain_events")
        .update({ tx_status: BlockchainTransactionStatus.SUBMITTING })
        .eq("id", params.eventId)
        .eq("tx_status", BlockchainTransactionStatus.PENDING)
        .is("transaction_hash", null)
        .select("id")
        .maybeSingle();
      if (claimError) {
        console.error("Claiming Blockchain event before submission failed", {
          eventId: params.eventId,
          claimError,
        });
        return;
      }
      if (!claimedRow) {
        console.error("Blockchain event was not claimable before submission", { eventId: params.eventId });
        return;
      }

      const result = await recordDeliveryEventOnChain({
        dbEventId: params.eventId,
        trackingCode: params.trackingCode,
        eventType: params.eventType,
        performedByAddress,
        eventDataHash: params.eventDataHash,
        onSubmitted: async (txHash) => {
          const { data: updatedRow, error } = await client
            .from("blockchain_events")
            .update({ transaction_hash: txHash })
            .eq("id", params.eventId)
            .eq("tx_status", BlockchainTransactionStatus.SUBMITTING)
            .is("transaction_hash", null)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!updatedRow) {
            throw new Error("No blockchain event row matched submitted transaction");
          }
        },
      });
      const { data: confirmedRow, error: confirmedError } = await client
        .from("blockchain_events")
        .update({
          tx_status: BlockchainTransactionStatus.CONFIRMED,
          transaction_hash: result.transactionHash,
          block_number: result.blockNumber,
          chain_timestamp: result.chainTimestamp,
        })
        .eq("id", params.eventId)
        .eq("tx_status", BlockchainTransactionStatus.SUBMITTING)
        .select("id")
        .maybeSingle();
      if (confirmedError || !confirmedRow) {
        console.error("Updating Blockchain event to confirmed failed", {
          eventId: params.eventId,
          status: BlockchainTransactionStatus.CONFIRMED,
          reason: confirmedError ?? "No submitting row matched the update",
        });
      }
    } catch (chainError) {
      console.error("recordDeliveryEventOnChain failed", { eventId: params.eventId, chainError });
      if (chainError instanceof BlockchainTransactionHashPersistenceError) {
        console.error("Transaction hash persistence failed after submission; leaving blockchain event submitting", {
          dbEventId: params.eventId,
          transactionHash: chainError.transactionHash,
          chainError,
        });
        return;
      }
      if (chainError instanceof BlockchainTransactionOutcomeUnknownError) {
        console.error("Leaving blockchain event submitting until its outcome can be reconciled", { eventId: params.eventId });
        return;
      }
      if (!(chainError instanceof BlockchainTransactionRevertedError)) {
        console.error("Leaving blockchain event submitting because dispatch failed before a definite outcome", { eventId: params.eventId });
        return;
      }

      const client = getSupabaseServiceClient();
      const { data: failedRow, error: failedError } = await client
        .from("blockchain_events")
        .update({ tx_status: BlockchainTransactionStatus.FAILED })
        .eq("id", params.eventId)
        .eq("tx_status", BlockchainTransactionStatus.SUBMITTING)
        .select("id")
        .maybeSingle();
      if (failedError || !failedRow) {
        console.error("Updating Blockchain event to failed did not update a row", {
          eventId: params.eventId,
          status: BlockchainTransactionStatus.FAILED,
          reason: failedError ?? "No submitting row matched the update",
        });
      }
    }
  };

  try {
    after(() => chainQueue);
  } catch (error) {
    console.error("Scheduling blockchain event failed", { eventId: params.eventId, error });
    return false;
  }

  chainQueue = chainQueue.then(job, job);
  return true;
}

/**
 * Ghi mốc vào blockchain_events với tx_status = pending rồi gửi giao dịch sau
 * khi API đã trả response. Confirm trên Amoy mất vài giây nên không được chặn
 * luồng nghiệp vụ; lỗi chain chỉ đánh dấu failed để xử lý lại, không làm hỏng
 * thao tác giao nhận đã lưu.
 */
export async function queueBlockchainEvent(
  params: QueueBlockchainEventParams,
): Promise<QueueBlockchainEventResult> {
  if (!isBlockchainWriteEnabled()) return { status: "disabled" };

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
    return { status: "enqueue_failed", error: error?.message ?? "No event row was returned" };
  }

  const scheduled = await dispatchBlockchainEvent({
    eventId: row.id,
    trackingCode: params.trackingCode,
    eventType: params.eventType,
    performedBy: params.performedBy,
    eventDataHash: hash,
  });
  if (!scheduled) {
    const { error: updateError } = await supabase
      .from("blockchain_events")
      .update({ tx_status: BlockchainTransactionStatus.FAILED })
      .eq("id", row.id)
      .eq("tx_status", BlockchainTransactionStatus.PENDING);
    if (updateError) {
      console.error("Could not mark unscheduled Blockchain event failed", { eventId: row.id, updateError });
    }
    return {
      status: "enqueue_failed",
      error: "Could not register the post-response blockchain dispatcher",
    };
  }
  return { status: "queued", eventId: row.id };
}
