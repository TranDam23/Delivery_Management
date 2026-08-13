import type { CodTransactionStatus } from "../enums";

export interface CodTransaction {
  id: string;
  order_id: string;
  amount: number;
  collected_by: string | null;
  collected_at: string | null;
  status: CodTransactionStatus;
  reconciled_at: string | null;
  reconciled_by: string | null;
  note: string | null;
}
