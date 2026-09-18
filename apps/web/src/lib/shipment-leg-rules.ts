import {
  ShipmentLegStatusCode,
  ShipmentLegType,
  WarehouseEventType,
} from "@delivery/shared";
import type { getSupabaseServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof getSupabaseServiceClient>;

export interface LegRuleInput {
  id: string;
  order_id: string;
  sequence_no: number;
  leg_type: string;
  from_warehouse_id: string | null;
  status: string;
  attempt_no: number | null;
  is_return: boolean | null;
}

export interface RuleResult {
  error: string | null;
  status: number;
}

const OK: RuleResult = { error: null, status: 200 };

export async function getMaxDeliveryAttempts(supabase: ServiceClient): Promise<number> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "MAX_DELIVERY_ATTEMPTS")
    .maybeSingle();
  return Math.max(1, Number(data?.value ?? 3) || 3);
}

/**
 * Chặng trước đã bàn giao xong để chặng này bắt đầu chưa.
 *
 * Chặng hoàn đầu tiên nối sau chặng giao cuối thất bại; tuyến hoàn chỉ được
 * tạo khi kho đã nhận lại hàng nên chặng FAILED đó được coi là đã kết thúc.
 */
export async function isPreviousLegReady(
  supabase: ServiceClient,
  leg: Pick<LegRuleInput, "order_id" | "sequence_no" | "is_return">,
): Promise<{ ready: boolean; error: string | null }> {
  if (leg.sequence_no <= 1) return { ready: true, error: null };
  const { data: previousLeg, error } = await supabase
    .from("shipment_legs")
    .select("leg_type, status, is_return")
    .eq("order_id", leg.order_id)
    .eq("sequence_no", leg.sequence_no - 1)
    .maybeSingle();
  if (error) return { ready: false, error: error.message };
  if (!previousLeg) return { ready: false, error: null };
  if (previousLeg.status === ShipmentLegStatusCode.COMPLETED) return { ready: true, error: null };
  const isReturnStart = Boolean(leg.is_return)
    && !previousLeg.is_return
    && previousLeg.leg_type === ShipmentLegType.LAST_MILE
    && previousLeg.status === ShipmentLegStatusCode.FAILED;
  return { ready: isReturnStart, error: null };
}

/** Kho đã quét nhận lại kiện sau lần giao thất bại hiện tại của chặng chưa. */
export async function hasReturnedToWarehouse(
  supabase: ServiceClient,
  leg: Pick<LegRuleInput, "id" | "from_warehouse_id" | "attempt_no">,
): Promise<{ returned: boolean; error: string | null }> {
  if (!leg.from_warehouse_id) return { returned: false, error: null };
  const { data, error } = await supabase
    .from("warehouse_events")
    .select("id")
    .eq("shipment_leg_id", leg.id)
    .eq("warehouse_id", leg.from_warehouse_id)
    .eq("event_type", WarehouseEventType.INBOUND)
    .eq("attempt_no", leg.attempt_no ?? 1)
    .limit(1);
  if (error) return { returned: false, error: error.message };
  return { returned: (data ?? []).length > 0, error: null };
}

/** Các điều kiện chung trước khi điều phối viên phân công shipper cho một chặng. */
export async function checkLegAssignable(supabase: ServiceClient, leg: LegRuleInput): Promise<RuleResult> {
  if (leg.status === ShipmentLegStatusCode.COMPLETED || leg.status === ShipmentLegStatusCode.CANCELLED) {
    return { error: "Không thể phân công chặng đã kết thúc", status: 409 };
  }
  if (leg.status === ShipmentLegStatusCode.IN_PROGRESS) {
    return { error: "Chặng đang được thực hiện, không thể đổi người phụ trách", status: 409 };
  }
  if (leg.leg_type === ShipmentLegType.TRANSFER) {
    return { error: "Chặng trung chuyển do nhân viên kho xác nhận nhập/xuất, không phân công shipper", status: 400 };
  }

  if (leg.status === ShipmentLegStatusCode.FAILED && leg.leg_type === ShipmentLegType.LAST_MILE) {
    if (!leg.is_return) {
      const { data: failedDelivery, error: failedDeliveryError } = await supabase
        .from("deliveries")
        .select("id")
        .eq("shipment_leg_id", leg.id)
        .maybeSingle();
      if (failedDeliveryError) return { error: failedDeliveryError.message, status: 500 };
      if (failedDelivery) {
        const { count, error: countError } = await supabase
          .from("delivery_attempts")
          .select("id", { count: "exact", head: true })
          .eq("delivery_id", failedDelivery.id);
        if (countError) return { error: countError.message, status: 500 };
        if ((count ?? 0) >= await getMaxDeliveryAttempts(supabase)) {
          return { error: "Đơn hàng đã đạt số lần giao tối đa và được chuyển sang tuyến hoàn hàng", status: 409 };
        }
      }
    }

    const returned = await hasReturnedToWarehouse(supabase, leg);
    if (returned.error) return { error: returned.error, status: 500 };
    if (!returned.returned) {
      return { error: "Kho phát chưa xác nhận nhận lại hàng sau lần giao thất bại, chưa thể phân công giao lại", status: 409 };
    }
  }

  if (leg.leg_type === ShipmentLegType.LAST_MILE) {
    const previous = await isPreviousLegReady(supabase, leg);
    if (previous.error) return { error: previous.error, status: 500 };
    if (!previous.ready) {
      return { error: "Hàng chưa đến kho phát, chưa thể phân công chặng giao cuối", status: 409 };
    }
  }

  return OK;
}
