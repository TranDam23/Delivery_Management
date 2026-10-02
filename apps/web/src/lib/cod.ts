export type CodState = "pending" | "collected" | "reconciled";

export const COD_LABEL: Record<CodState, string> = {
  pending: "Chưa thu",
  collected: "Đã thu, chờ đối soát",
  reconciled: "Đã đối soát, chưa xác nhận chuyển trả",
};

export interface CodListItem {
  id: string;
  trackingCode: string;
  senderName: string;
  amount: number;
  orderStatus: string;
  codStatus: CodState;
  collectedAt: string | null;
  reconciledAt: string | null;
  collectedBy: string | null;
  reconciledBy: string | null;
}
