import {
  ShipmentLegStatusCode,
  ShipmentLegType,
  type ShipmentLegStatusCode as ShipmentLegStatus,
  type ShipmentLegType as ShipmentType,
} from "@delivery/shared";
import { relationValue } from "@/lib/order-ui";

export interface StaffAddress {
  recipient_name: string | null;
  phone: string | null;
  address_line: string;
  ward: string | null;
  district: string | null;
  province: string | null;
}

export interface StaffOrder {
  id: string;
  tracking_code: string;
  service_type: string;
  cod_amount: number;
  note: string | null;
  pickup_address: StaffAddress | StaffAddress[] | null;
  delivery_address: StaffAddress | StaffAddress[] | null;
}

export interface StaffWarehouse {
  id: string;
  code: string;
  name: string;
  ward: string | null;
  province: string;
  district: string | null;
  status: string;
  warehouse_level: string;
}

export interface DeliveryStatusEvent {
  event_time: string;
  status_id: string;
  order_statuses: { code: string } | { code: string }[] | null;
}

export interface DeliveryLink {
  id: string;
  delivery_staff_id: string;
  received_at: string | null;
  delivery_events: DeliveryStatusEvent[] | null;
}

export interface AssignedLeg {
  id: string;
  order_id: string;
  sequence_no: number;
  leg_type: ShipmentType;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  assigned_staff_id: string | null;
  assigned_at: string | null;
  status: ShipmentLegStatus;
  attempt_no: number;
  is_return: boolean;
  started_at: string | null;
  completed_at: string | null;
  note: string | null;
  updated_at: string;
  orders: StaffOrder | StaffOrder[] | null;
  from_warehouse: StaffWarehouse | StaffWarehouse[] | null;
  to_warehouse: StaffWarehouse | StaffWarehouse[] | null;
  deliveries: DeliveryLink | DeliveryLink[] | null;
}

/** Nhóm hiển thị trên app shipper. */
export type LegBucket = "todo" | "waiting" | "done";

/**
 * - todo: shipper phải thao tác ngay (đi lấy hàng, đang giao);
 * - waiting: chờ kho quét (bàn giao hàng về kho, chờ kho xuất hàng, mang
 *   hàng giao thất bại về kho);
 * - done: chặng đã kết thúc với shipper.
 */
export function legBucket(leg: AssignedLeg): LegBucket {
  if (leg.leg_type === ShipmentLegType.PICKUP) {
    if (leg.status === ShipmentLegStatusCode.ASSIGNED) return "todo";
    if (leg.status === ShipmentLegStatusCode.IN_PROGRESS) return "waiting";
    return "done";
  }
  if (leg.status === ShipmentLegStatusCode.IN_PROGRESS) return "todo";
  if (leg.status === ShipmentLegStatusCode.ASSIGNED || leg.status === ShipmentLegStatusCode.FAILED) return "waiting";
  return "done";
}

export function legTitle(leg: AssignedLeg): string {
  if (leg.leg_type === ShipmentLegType.PICKUP) return "Lấy hàng";
  return leg.is_return ? "Giao hoàn" : "Giao hàng";
}

/** Khách mà shipper gặp ở chặng này: người gửi khi lấy hàng/giao hoàn, người nhận khi giao. */
export function customerStop(leg: AssignedLeg): { role: string; address: StaffAddress | null } {
  const order = relationValue(leg.orders);
  if (leg.leg_type === ShipmentLegType.PICKUP) {
    return { role: "Người gửi", address: relationValue(order?.pickup_address ?? null) };
  }
  if (leg.is_return) return { role: "Người gửi (hoàn hàng)", address: relationValue(order?.pickup_address ?? null) };
  return { role: "Người nhận", address: relationValue(order?.delivery_address ?? null) };
}

/** Kho shipper giao hàng về (lấy hàng) hoặc nhận hàng đi giao (giao cuối). */
export function legWarehouse(leg: AssignedLeg): StaffWarehouse | null {
  return relationValue(leg.leg_type === ShipmentLegType.PICKUP ? leg.to_warehouse : leg.from_warehouse);
}

export function addressLine(address: StaffAddress | null): string {
  if (!address) return "Chưa có địa chỉ";
  return [address.address_line, address.ward, address.district, address.province].filter(Boolean).join(", ");
}

export function directionsUrl(address: StaffAddress | null): string | null {
  if (!address) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressLine(address))}`;
}

export function hasDeliveryStatus(delivery: DeliveryLink | null, code: string, since: string | null): boolean {
  return delivery?.delivery_events?.some((event) =>
    relationValue(event.order_statuses)?.code === code
      && (!since || event.event_time >= since),
  ) ?? false;
}

/** Việc shipper cần làm khi chặng đang chờ kho. */
export function waitingHint(leg: AssignedLeg): string | null {
  const warehouse = legWarehouse(leg);
  const code = warehouse ? `${warehouse.code} · ${warehouse.name}` : "phụ trách";
  if (leg.leg_type === ShipmentLegType.PICKUP && leg.status === ShipmentLegStatusCode.IN_PROGRESS) {
    return `Mang kiện về kho ${code} và bàn giao để nhân viên kho kiểm hàng, nhập kho.`;
  }
  if (leg.leg_type === ShipmentLegType.LAST_MILE && leg.status === ShipmentLegStatusCode.ASSIGNED) {
    return `Đến kho ${code} nhận kiện. Nút bắt đầu giao sẽ mở khi kho xác nhận xuất kho.`;
  }
  if (leg.leg_type === ShipmentLegType.LAST_MILE && leg.status === ShipmentLegStatusCode.FAILED) {
    return `Mang kiện về kho ${code} để nhân viên kho nhận lại trước khi giao lại hoặc hoàn hàng.`;
  }
  return null;
}

/** Chặng cần làm trước: đang giao, rồi đi lấy hàng; trong nhóm xếp theo lúc được phân công. */
export function sortLegs(legs: AssignedLeg[]): AssignedLeg[] {
  const rank = (leg: AssignedLeg): number => {
    if (leg.leg_type === ShipmentLegType.LAST_MILE && leg.status === ShipmentLegStatusCode.IN_PROGRESS) return 0;
    if (leg.leg_type === ShipmentLegType.PICKUP && leg.status === ShipmentLegStatusCode.ASSIGNED) return 1;
    return 2;
  };
  return [...legs].sort((left, right) => rank(left) - rank(right)
    || (left.assigned_at ?? left.updated_at).localeCompare(right.assigned_at ?? right.updated_at));
}
