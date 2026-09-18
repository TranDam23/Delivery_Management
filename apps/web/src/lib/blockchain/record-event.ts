import { dataSlice, getAddress, keccak256, toUtf8Bytes } from "ethers";
import type { BlockchainEventType } from "@delivery/shared";
import { getBlockchainOperatorContract } from "./provider";

export interface RecordDeliveryEventParams {
  trackingCode: string;
  eventType: BlockchainEventType;
  performedByAddress: string;
  /** keccak256 của payload đã chuẩn hóa, xem hashEventPayload. */
  eventDataHash: string;
}

export interface RecordDeliveryEventResult {
  eventDataHash: string;
  transactionHash: string;
  blockNumber: number;
  chainTimestamp: string | null;
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

  const tx = await contract.recordEvent(
    params.trackingCode,
    params.eventType,
    params.performedByAddress,
    params.eventDataHash,
  );
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Transaction was dropped/replaced before confirmation");
  const block = await receipt.getBlock().catch(() => null);

  return {
    eventDataHash: params.eventDataHash,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    chainTimestamp: block ? new Date(block.timestamp * 1000).toISOString() : null,
  };
}
