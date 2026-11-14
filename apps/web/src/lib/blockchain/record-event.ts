import { dataSlice, getAddress, isError, keccak256, toUtf8Bytes, zeroPadValue } from "ethers";
import type { BlockchainEventType } from "@delivery/shared";
import { getBlockchainOperatorContract } from "./provider";

export interface RecordDeliveryEventParams {
  /** UUID cua ban ghi blockchain_events.id trong Database. */
  dbEventId: string;
  trackingCode: string;
  eventType: BlockchainEventType;
  performedByAddress: string;
  /** keccak256 của payload đã chuẩn hóa, xem hashEventPayload. */
  eventDataHash: string;
  onSubmitted?: (txHash: string) => Promise<void>;
}

const DATABASE_EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Chuyen UUID Database thanh bytes32 deterministic de retry dung cung event ID. */
export function onChainEventIdFromDatabaseUuid(dbEventId: string): string {
  if (!DATABASE_EVENT_ID_PATTERN.test(dbEventId)) {
    throw new TypeError("dbEventId must be a canonical UUID");
  }

  return zeroPadValue(`0x${dbEventId.replace(/-/g, "")}`, 32);
}

export interface RecordDeliveryEventResult {
  eventDataHash: string;
  transactionHash: string;
  blockNumber: number;
  chainTimestamp: string | null;
}

export class BlockchainTransactionOutcomeUnknownError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BlockchainTransactionOutcomeUnknownError";
  }
}

export class BlockchainTransactionHashPersistenceError extends Error {
  readonly transactionHash: string;

  constructor(transactionHash: string, options?: ErrorOptions) {
    super("Blockchain transaction was submitted but its hash could not be persisted", options);
    this.name = "BlockchainTransactionHashPersistenceError";
    this.transactionHash = transactionHash;
  }
}

export class BlockchainTransactionRevertedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BlockchainTransactionRevertedError";
  }
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function canonicalize(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = canonicalize(item);
    }
    return result;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  return String(value);
}

/**
 * Chuẩn hóa payload (sắp xếp key đệ quy, bỏ undefined) rồi băm keccak256.
 * JSON.stringify thường phụ thuộc thứ tự key nên cùng một dữ liệu có thể ra
 * hai hash khác nhau và làm bước xác minh báo sai.
 */
export function hashEventPayload(payload: Record<string, unknown>): { payload: JsonValue; hash: string } {
  const normalized = canonicalize(payload);
  return { payload: normalized, hash: keccak256(toUtf8Bytes(JSON.stringify(normalized))) };
}

/**
 * Địa chỉ đại diện ẩn danh cho một tài khoản nội bộ. Người dùng không có ví
 * riêng nên không đưa users.id hay thông tin cá nhân lên chain; ai có users.id
 * vẫn tính lại được địa chỉ này để đối chiếu.
 */
export function actorAddressForUser(userId: string): string {
  return getAddress(dataSlice(keccak256(toUtf8Bytes(`delivertrust:user:${userId}`)), 12));
}

/** Ghi một mốc sự kiện lên smart contract DeliveryTracking bằng ví operator. */
export async function recordDeliveryEventOnChain(
  params: RecordDeliveryEventParams,
): Promise<RecordDeliveryEventResult> {
  const contract = getBlockchainOperatorContract();
  const onChainEventId = onChainEventIdFromDatabaseUuid(params.dbEventId);

  let tx: Awaited<ReturnType<typeof contract.recordEvent>>;
  try {
    tx = await contract.recordEvent(
      params.trackingCode,
      params.eventType,
      params.performedByAddress,
      params.eventDataHash,
      onChainEventId,
    );
  } catch (error) {
    throw new BlockchainTransactionOutcomeUnknownError(
      "Blockchain transaction submission outcome is unknown",
      { cause: error },
    );
  }

  try {
    await params.onSubmitted?.(tx.hash);
  } catch (error) {
    throw new BlockchainTransactionHashPersistenceError(tx.hash, { cause: error });
  }

  let receipt: Awaited<ReturnType<typeof tx.wait>>;
  try {
    receipt = await tx.wait();
  } catch (error) {
    if (isError(error, "TRANSACTION_REPLACED")) {
      const replacementReceipt = error.receipt;
      if (
        error.reason !== "repriced"
        || error.cancelled
        || !replacementReceipt
        || replacementReceipt.status !== 1
        || typeof replacementReceipt.hash !== "string"
        || typeof replacementReceipt.blockNumber !== "number"
        || typeof replacementReceipt.getBlock !== "function"
      ) {
        throw new BlockchainTransactionOutcomeUnknownError(
          "Blockchain transaction replacement outcome is unknown",
          { cause: error },
        );
      }

      let replacementBlock: Awaited<ReturnType<typeof replacementReceipt.getBlock>>;
      try {
        replacementBlock = await replacementReceipt.getBlock();
      } catch (blockError) {
        throw new BlockchainTransactionOutcomeUnknownError(
          "Blockchain replacement succeeded but its block could not be loaded",
          { cause: blockError },
        );
      }

      if (!replacementBlock) {
        throw new BlockchainTransactionOutcomeUnknownError(
          "Blockchain replacement succeeded but its block timestamp is unavailable",
          { cause: error },
        );
      }

      const timestamp = replacementBlock.timestamp;
      if (
        typeof timestamp !== "number"
        || !Number.isFinite(timestamp)
        || timestamp < 0
      ) {
        throw new BlockchainTransactionOutcomeUnknownError(
          "Blockchain replacement returned an invalid block timestamp",
          { cause: error },
        );
      }

      let chainTimestamp: string;
      try {
        chainTimestamp = new Date(timestamp * 1000).toISOString();
      } catch (dateError) {
        throw new BlockchainTransactionOutcomeUnknownError(
          "Blockchain replacement returned a timestamp outside the valid date range",
          { cause: dateError },
        );
      }

      return {
        eventDataHash: params.eventDataHash,
        transactionHash: replacementReceipt.hash,
        blockNumber: replacementReceipt.blockNumber,
        chainTimestamp,
      };
    }

    const failedReceipt = typeof error === "object" && error !== null && "receipt" in error
      ? error.receipt
      : null;
    if (
      typeof failedReceipt === "object"
      && failedReceipt !== null
      && "status" in failedReceipt
      && failedReceipt.status === 0
    ) {
      throw new BlockchainTransactionRevertedError("Blockchain transaction reverted", { cause: error });
    }
    throw new BlockchainTransactionOutcomeUnknownError(
      "Blockchain transaction was submitted but its final outcome is unknown",
      { cause: error },
    );
  }
  if (!receipt) {
    throw new BlockchainTransactionOutcomeUnknownError(
      "Blockchain transaction was submitted but no receipt was returned",
    );
  }
  if (receipt.status === 0) {
    throw new BlockchainTransactionRevertedError("Blockchain transaction reverted");
  }
  const block = await receipt.getBlock().catch(() => null);

  return {
    eventDataHash: params.eventDataHash,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainTimestamp: block ? new Date(block.timestamp * 1000).toISOString() : null,
  };
}
