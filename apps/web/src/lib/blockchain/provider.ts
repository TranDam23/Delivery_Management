import { Contract, JsonRpcProvider, Wallet, type BaseContract, type ContractTransactionResponse } from "ethers";
import DeliveryTrackingAbi from "./DeliveryTracking.abi.json";

export interface OnChainDeliveryEventStruct {
  trackingCode: string;
  eventType: string;
  performedBy: string;
  eventDataHash: string;
  timestamp: bigint;
}

/** Interface typed toi thieu cho cac ham cua DeliveryTracking.sol ma backend goi toi. */
export interface DeliveryTrackingContract extends BaseContract {
  recordEvent(
    trackingCode: string,
    eventType: string,
    performedBy: string,
    eventDataHash: string,
  ): Promise<ContractTransactionResponse>;
  getEvents(trackingCode: string): Promise<OnChainDeliveryEventStruct[]>;
  getEventCount(trackingCode: string): Promise<bigint>;
  getLatestEvent(trackingCode: string): Promise<OnChainDeliveryEventStruct>;
  setOperator(operator: string, allowed: boolean): Promise<ContractTransactionResponse>;
}

/**
 * Vi/service dung de ky va gui giao dich ghi su kien len smart contract
 * DeliveryTracking (xem packages/contracts). CHI dung trong server-side code.
 */
export function getBlockchainOperatorContract(): DeliveryTrackingContract {
  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
  const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
  const contractAddress = process.env.NEXT_PUBLIC_DELIVERY_CONTRACT_ADDRESS;

  if (!rpcUrl || !privateKey || !contractAddress) {
    throw new Error(
      "Missing POLYGON_AMOY_RPC_URL, BLOCKCHAIN_PRIVATE_KEY or NEXT_PUBLIC_DELIVERY_CONTRACT_ADDRESS env vars",
    );
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  return new Contract(contractAddress, DeliveryTrackingAbi, wallet) as unknown as DeliveryTrackingContract;
}

/** Contract read-only (khong can private key), du dung de tra cuu/xac minh. */
export function getBlockchainReadOnlyContract(): DeliveryTrackingContract {
  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL;
  const contractAddress = process.env.NEXT_PUBLIC_DELIVERY_CONTRACT_ADDRESS;

  if (!rpcUrl || !contractAddress) {
    throw new Error(
      "Missing POLYGON_AMOY_RPC_URL or NEXT_PUBLIC_DELIVERY_CONTRACT_ADDRESS env vars",
    );
  }

  const provider = new JsonRpcProvider(rpcUrl);
  return new Contract(contractAddress, DeliveryTrackingAbi, provider) as unknown as DeliveryTrackingContract;
}
