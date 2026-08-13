import type { BlockchainEventType } from "../enums";

export interface BlockchainEvent {
  id: string;
  order_id: string;
  event_type: BlockchainEventType;
  event_data_hash: string;
  previous_hash: string | null;
  transaction_hash: string | null;
  block_number: number | null;
  created_at: string;
}

/** Payload gui len smart contract DeliveryTracking.recordEvent() */
export interface RecordDeliveryEventInput {
  trackingCode: string;
  eventType: BlockchainEventType;
  performedBy: string;
  eventDataHash: string;
}

/** Ket qua tra ve tu chain sau khi verify hanh trinh don hang */
export interface OnChainDeliveryEvent {
  trackingCode: string;
  eventType: string;
  performedBy: string;
  eventDataHash: string;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}
