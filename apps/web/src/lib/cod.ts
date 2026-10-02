export type CodState = "pending" | "collected" | "reconciled";

export const COD_LABEL: Record<CodState, string> = {
  pending: "Chưa thu",
  collected: "Đã thu",
  reconciled: "Đã đối soát, chờ chuyển trả người gửi",
};

export const COD_REMITTED_LABEL = "Đã chuyển trả người gửi";

/** Nhãn theo chặng: thu → nộp bưu cục → đối soát → chuyển trả người gửi. */
export function codStateLabel(state: CodState, remittedAt: string | null, handedOverAt: string | null = null): string {
  if (state === "reconciled" && remittedAt) return COD_REMITTED_LABEL;
  if (state === "collected") return handedOverAt ? "Bưu cục đã nhận tiền, chờ đối soát" : "Đã thu, chờ shipper nộp về bưu cục";
  return COD_LABEL[state];
}

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
  remittedAt: string | null;
  handedOverAt: string | null;
}
