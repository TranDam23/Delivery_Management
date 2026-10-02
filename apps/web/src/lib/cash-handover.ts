import { RoleCode, type AuthTokenPayload } from "@delivery/shared";
import { getUserOperationalScope } from "@/lib/dispatcher-scope";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export interface HandoverItem {
  orderId: string;
  trackingCode: string;
  kind: "cod" | "shipping_fee";
  amount: number;
}

export interface HandoverSummary {
  id: string;
  status: "pending" | "confirmed" | "rejected";
  codAmount: number;
  feeAmount: number;
  submittedAt: string;
  confirmedAt: string | null;
  note: string | null;
  shipperName: string;
  warehouseName: string;
  items: HandoverItem[];
}

export const HANDOVER_STATUS_LABEL: Record<HandoverSummary["status"], string> = {
  pending: "Chờ bưu cục xác nhận",
  confirmed: "Bưu cục đã nhận tiền",
  rejected: "Bị từ chối",
};

/**
 * Các kho mà tài khoản được xác nhận phiếu nộp: nhân viên kho và điều phối viên chỉ
 * kho/tỉnh phụ trách; null nghĩa là mọi kho (Admin).
 */
export async function handoverWarehouseScope(auth: AuthTokenPayload): Promise<{ ids: string[] | null; error: string | null }> {
  if (auth.roleCode === RoleCode.ADMIN) return { ids: null, error: null };
  if (auth.roleCode !== RoleCode.WAREHOUSE_STAFF && auth.roleCode !== RoleCode.DISPATCHER) return { ids: [], error: "Forbidden" };
  const scope = await getUserOperationalScope(auth);
  if (scope.error) return { ids: [], error: scope.error };
  if (!scope.warehouseId) return { ids: [], error: "Tài khoản chưa được gán kho phụ trách" };
  if (auth.roleCode === RoleCode.DISPATCHER && scope.warehouseLevel === "PROVINCE" && scope.province) {
    const { data, error } = await getSupabaseServiceClient().from("warehouses").select("id").eq("province", scope.province);
    if (error) return { ids: [], error: error.message };
    return { ids: (data ?? []).map((row) => row.id), error: null };
  }
  return { ids: [scope.warehouseId], error: null };
}
