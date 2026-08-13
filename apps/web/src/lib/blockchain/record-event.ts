import { keccak256, toUtf8Bytes } from "ethers";
import type { BlockchainEventType } from "@delivery/shared";
import { getBlockchainOperatorContract } from "./provider";

export interface RecordDeliveryEventParams {
  trackingCode: string;
  eventType: BlockchainEventType;
  performedByAddress: string;
  /** Du lieu chi tiet se duoc bam bang keccak256, KHONG luu truc tiep len chain. */
  eventPayload: Record<string, unknown>;
}

export interface RecordDeliveryEventResult {
  eventDataHash: string;
  transactionHash: string;
  blockNumber: number;
}

/**
 * Ghi mot moc su kien giao nhan len smart contract DeliveryTracking, sau do
 * luu lai transaction_hash/block_number vao bang blockchain_events (Supabase).
 * Goi tu API route sau khi da cap nhat trang thai don hang trong DB.
 */
export async function recordDeliveryEventOnChain(
  params: RecordDeliveryEventParams,
): Promise<RecordDeliveryEventResult> {
  const eventDataHash = keccak256(toUtf8Bytes(JSON.stringify(params.eventPayload)));
  const contract = getBlockchainOperatorContract();

  const tx = await contract.recordEvent(
    params.trackingCode,
    params.eventType,
    params.performedByAddress,
    eventDataHash,
  );
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Transaction was dropped/replaced before confirmation");

  return {
    eventDataHash,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}
