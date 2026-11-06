import { OrderStatusCode, ShipmentLegStatusCode, ShipmentLegType, WarehouseEventType } from "@delivery/shared";
import type { OrderProgress, ProgressLeg, ProgressPhase } from "@/lib/order-progress-types";
import { relationValue } from "@/lib/order-ui";
import type { getSupabaseServiceClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof getSupabaseServiceClient>;

interface WarehouseRef { name: string; province: string }

interface LegRow {
  sequence_no: number;
  leg_type: "PICKUP" | "TRANSFER" | "LAST_MILE";
  status: string;
  is_return: boolean;
  attempt_no: number | null;
  from_warehouse_id: string | null;
  from_warehouse: WarehouseRef | WarehouseRef[] | null;
  to_warehouse: WarehouseRef | WarehouseRef[] | null;
  staff: { full_name: string } | { full_name: string }[] | null;
  id: string;
}

function roleLabel(type: LegRow["leg_type"]): string {
  return type === ShipmentLegType.TRANSFER ? "Nhân viên kho" : "Nhân viên giao nhận";
}

/**
 * Tiến độ vận chuyển của đơn: hàng đang ở kho nào, chặng nào đang chạy và ai phụ trách.
 * Tên nhân viên chỉ trả về khi revealStaffNames = true (Admin/điều phối viên được phép xem đơn);
 * người gửi, người nhận và tra cứu công khai chỉ thấy vai trò.
 */
export async function buildOrderProgress(
  supabase: ServiceClient,
  orderId: string,
  options: { statusCode: string | null; revealStaffNames: boolean },
): Promise<{ progress: OrderProgress | null; error: string | null }> {
  const { data, error } = await supabase
    .from("shipment_legs")
    .select(`id, sequence_no, leg_type, status, is_return, attempt_no, from_warehouse_id,
      from_warehouse:warehouses!shipment_legs_from_warehouse_id_fkey(name, province),
      to_warehouse:warehouses!shipment_legs_to_warehouse_id_fkey(name, province),
      staff:users!shipment_legs_assigned_staff_id_fkey(full_name)`)
    .eq("order_id", orderId)
    .neq("status", ShipmentLegStatusCode.CANCELLED)
    .order("is_return", { ascending: true })
    .order("sequence_no", { ascending: true });
  if (error) return { progress: null, error: error.message };

  const rows = (data ?? []) as unknown as LegRow[];
  if (rows.length === 0) return { progress: null, error: null };

  // Kiện giao thất bại đã được kho phát nhận lại chưa: dựa vào sự kiện nhập kho của chặng giao cuối.
  const { data: inbound, error: inboundError } = await supabase
    .from("warehouse_events")
    .select("shipment_leg_id, attempt_no")
    .eq("order_id", orderId)
    .eq("event_type", WarehouseEventType.INBOUND);
  if (inboundError) return { progress: null, error: inboundError.message };
  const inboundKeys = new Set((inbound ?? []).map((event) => `${event.shipment_leg_id}:${event.attempt_no}`));

  const toLeg = (row: LegRow): ProgressLeg => {
    const staff = relationValue(row.staff)?.full_name ?? null;
    return {
      sequence: row.sequence_no,
      type: row.leg_type,
      isReturn: row.is_return,
      status: row.status,
      from: relationValue(row.from_warehouse)?.name ?? null,
      to: relationValue(row.to_warehouse)?.name ?? null,
      staff: staff ? (options.revealStaffNames ? staff : roleLabel(row.leg_type)) : null,
      staffNameHidden: Boolean(staff) && !options.revealStaffNames,
      attemptNo: row.attempt_no ?? 1,
    };
  };
  const legs = rows.map(toLeg);

  const inProgressIndex = rows.findIndex((row) => row.status === ShipmentLegStatusCode.IN_PROGRESS);
  const settled = rows.map((row, index) => ({ row, index }))
    .filter(({ row }) => row.status === ShipmentLegStatusCode.COMPLETED || row.status === ShipmentLegStatusCode.FAILED);
  const lastSettled = settled[settled.length - 1];
  const returning = rows.some((row) => row.is_return);

  let phase: ProgressPhase;
  let currentWarehouse: OrderProgress["currentWarehouse"] = null;
  let transit: OrderProgress["transit"] = null;
  let currentIndex = -1;
  let currentLegIsNext = false;

  if (options.statusCode === OrderStatusCode.CANCELLED) {
    phase = "CANCELLED";
  } else if (inProgressIndex >= 0) {
    const row = rows[inProgressIndex]!;
    currentIndex = inProgressIndex;
    if (row.leg_type === ShipmentLegType.PICKUP) {
      phase = "PICKING_UP";
    } else if (row.leg_type === ShipmentLegType.LAST_MILE) {
      phase = "DELIVERING";
    } else {
      phase = "IN_TRANSIT";
      transit = { from: relationValue(row.from_warehouse)?.name ?? "kho gửi", to: relationValue(row.to_warehouse)?.name ?? "kho nhận" };
    }
  } else if (!lastSettled) {
    phase = "NOT_PICKED_UP";
  } else {
    const { row } = lastSettled;
    if (row.leg_type === ShipmentLegType.LAST_MILE) {
      if (row.status === ShipmentLegStatusCode.COMPLETED) {
        phase = "COMPLETED";
      } else if (inboundKeys.has(`${row.id}:${row.attempt_no ?? 1}`)) {
        phase = "AT_WAREHOUSE";
        currentWarehouse = relationValue(row.from_warehouse);
      } else {
        phase = "DELIVERY_FAILED";
      }
    } else {
      phase = "AT_WAREHOUSE";
      currentWarehouse = relationValue(row.to_warehouse);
    }
  }

  if (currentIndex < 0 && phase !== "COMPLETED" && phase !== "CANCELLED") {
    // Chưa có chặng nào đang chạy: chặng kế tiếp là chặng chưa hoàn tất đầu tiên.
    currentIndex = rows.findIndex((row) => row.status !== ShipmentLegStatusCode.COMPLETED && row.status !== ShipmentLegStatusCode.FAILED);
    currentLegIsNext = currentIndex >= 0;
  }

  const legsDone = rows.filter((row) => row.status === ShipmentLegStatusCode.COMPLETED).length;
  return {
    progress: {
      phase,
      returning,
      currentWarehouse,
      transit,
      currentLeg: currentIndex >= 0 ? legs[currentIndex]! : null,
      currentLegIsNext,
      legs,
      legsDone,
      legsTotal: rows.length,
    },
    error: null,
  };
}
