import {
  ShipmentLegStatusCode,
  ShipmentLegType,
  WarehouseEventType,
  WarehouseLevelCode,
  type Warehouse,
} from "@delivery/shared";

export interface WarehouseAddress {
  recipient_name: string | null;
  phone: string | null;
  address_line: string;
  ward: string | null;
  district: string | null;
  province: string | null;
}

export interface OrderItem {
  item_name: string;
  quantity: number;
  weight: number | null;
}

export interface WarehouseOrder {
  id: string;
  tracking_code: string;
  service_type: string;
  cod_amount: number;
  note: string | null;
  order_items: OrderItem[] | null;
  pickup_address: WarehouseAddress | WarehouseAddress[] | null;
  delivery_address: WarehouseAddress | WarehouseAddress[] | null;
}

export interface WarehouseSummary {
  id: string;
  code: string;
  name: string;
  ward: string | null;
  province: string;
  district: string | null;
  status: string;
  warehouse_level: string;
}

export interface WarehouseEvent {
  id: string;
  event_type: string;
  event_time: string;
  attempt_no: number;
  package_condition: string | null;
  actual_weight_kg: number | null;
  note: string | null;
  performer?: { full_name: string } | { full_name: string }[] | null;
}

export interface WarehouseOperationLeg {
  id: string;
  order_id: string;
  sequence_no: number;
  leg_type: ShipmentLegType;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  assigned_staff_id: string | null;
  status: ShipmentLegStatusCode;
  attempt_no: number;
  is_return: boolean;
  started_at: string | null;
  completed_at: string | null;
  note: string | null;
  updated_at: string;
  orders: WarehouseOrder | WarehouseOrder[] | null;
  from_warehouse: WarehouseSummary | WarehouseSummary[] | null;
  to_warehouse: WarehouseSummary | WarehouseSummary[] | null;
  warehouse_events: WarehouseEvent[];
}

export interface WarehouseOperationsResponse {
  warehouse: Warehouse;
  legs: WarehouseOperationLeg[];
}

/**
 * Tình trạng của một chặng nhìn từ kho đang đăng nhập:
 * - INBOUND / RETURN_INBOUND / OUTBOUND: kho phải thao tác ngay;
 * - HOLDING: hàng đang nằm ở kho, chờ điều phối phân công shipper;
 * - INCOMING: hàng đang trên đường tới hoặc shipper chưa lấy;
 * - OTHER: đã xong hoặc không còn liên quan.
 */
export type LegState = "INBOUND" | "RETURN_INBOUND" | "OUTBOUND" | "HOLDING" | "INCOMING" | "OTHER";

export const ACTIONABLE_STATES: readonly LegState[] = ["INBOUND", "RETURN_INBOUND", "OUTBOUND"];

export function warehouseName(warehouse: WarehouseSummary | null): string {
  if (!warehouse) return "";
  const level = warehouse.warehouse_level === WarehouseLevelCode.REGIONAL
    ? "Trung tâm vùng"
    : warehouse.warehouse_level === WarehouseLevelCode.PROVINCE ? "Kho tỉnh" : "Kho";
  return `${warehouse.code} · ${level} ${warehouse.province}`;
}

export function itemSummary(order: WarehouseOrder | null): string {
  const items = order?.order_items ?? [];
  if (items.length === 0) return "Chưa khai báo hàng hóa";
  return items.map((item) => `${item.item_name} ×${item.quantity}`).join(", ");
}

export function eventRecorded(leg: WarehouseOperationLeg, eventType: WarehouseEventType): boolean {
  return leg.warehouse_events.some((event) =>
    event.event_type === eventType && (event.attempt_no ?? 1) === (leg.attempt_no ?? 1),
  );
}

/**
 * Tính trạng thái từng chặng. Cần cả danh sách chặng của kho để biết hàng đã
 * thực sự về kho chưa (chặng liền trước phải hoàn tất), đúng quy tắc API áp
 * dụng khi xuất kho.
 */
export function computeLegStates(legs: WarehouseOperationLeg[], warehouseId: string | undefined): Map<string, LegState> {
  const byOrderSeq = new Map(legs.map((leg) => [`${leg.order_id}:${leg.sequence_no}`, leg]));
  const ordersWithReturn = new Set(legs.filter((leg) => leg.is_return).map((leg) => leg.order_id));
  const result = new Map<string, LegState>();

  for (const leg of legs) {
    let state: LegState = "OTHER";
    if (!warehouseId || leg.status === ShipmentLegStatusCode.CANCELLED) {
      result.set(leg.id, state);
      continue;
    }
    const previous = byOrderSeq.get(`${leg.order_id}:${leg.sequence_no - 1}`);
    // Hàng đang ở kho: chặng trước (về kho này) đã hoàn tất, hoặc là chặng hoàn
    // đầu tiên nối sau lần giao cuối thất bại.
    const goodsHere = Boolean(previous) && (
      previous?.status === ShipmentLegStatusCode.COMPLETED
      || (leg.is_return && previous?.leg_type === ShipmentLegType.LAST_MILE && previous.status === ShipmentLegStatusCode.FAILED)
    );

    if (leg.to_warehouse_id === warehouseId && leg.leg_type !== ShipmentLegType.LAST_MILE) {
      if (leg.status === ShipmentLegStatusCode.IN_PROGRESS && !eventRecorded(leg, WarehouseEventType.INBOUND)) state = "INBOUND";
      else if (leg.status === ShipmentLegStatusCode.PENDING || leg.status === ShipmentLegStatusCode.ASSIGNED) state = "INCOMING";
    }
    if (leg.from_warehouse_id === warehouseId) {
      const waitingToLeave = (leg.status === ShipmentLegStatusCode.PENDING || leg.status === ShipmentLegStatusCode.ASSIGNED)
        && !eventRecorded(leg, WarehouseEventType.OUTBOUND);
      if (leg.leg_type === ShipmentLegType.LAST_MILE && leg.status === ShipmentLegStatusCode.FAILED) {
        if (!eventRecorded(leg, WarehouseEventType.INBOUND)) state = "RETURN_INBOUND";
        else if (!ordersWithReturn.has(leg.order_id)) state = "HOLDING";
      } else if (waitingToLeave && goodsHere) {
        const shipperReady = leg.leg_type !== ShipmentLegType.LAST_MILE
          || (leg.status === ShipmentLegStatusCode.ASSIGNED && Boolean(leg.assigned_staff_id));
        state = shipperReady ? "OUTBOUND" : "HOLDING";
      }
    }
    result.set(leg.id, state);
  }
  return result;
}
