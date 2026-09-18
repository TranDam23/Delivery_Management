import { OrderStatusCode } from "@delivery/shared";

export interface OrderStatusSummary {
  code: string;
  name: string;
  is_final?: boolean;
}

export interface OrderContactSummary {
  id: string;
  name: string;
  phone: string;
}

export interface OrderAddressSummary {
  id: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  ward: string | null;
  district: string | null;
  province: string | null;
}

export interface OrderWarehouseSummary {
  id: string;
  code: string;
  name: string;
  ward: string | null;
  district: string | null;
  province: string;
  warehouse_level: string;
}

export interface OrderListItem {
  id: string;
  tracking_code: string;
  qr_code: string;
  sender_id: string;
  receiver_id: string;
  service_type: string;
  cod_amount: number;
  total_fee: number;
  note: string | null;
  created_at: string;
  order_statuses: OrderStatusSummary | OrderStatusSummary[] | null;
  sender: OrderContactSummary | OrderContactSummary[] | null;
  receiver: OrderContactSummary | OrderContactSummary[] | null;
  pickup_address: OrderAddressSummary | OrderAddressSummary[] | null;
  delivery_address: OrderAddressSummary | OrderAddressSummary[] | null;
  pickup_warehouse?: OrderWarehouseSummary | OrderWarehouseSummary[] | null;
  delivery_warehouse?: OrderWarehouseSummary | OrderWarehouseSummary[] | null;
}

export interface OrderDetail extends OrderListItem {
  cancel_reason: string | null;
  updated_at: string;
  order_items: Array<{
    id: string;
    item_name: string;
    item_type: string | null;
    quantity: number;
    weight: number | null;
    length: number | null;
    width: number | null;
    height: number | null;
    declared_value: number | null;
    note: string | null;
  }>;
}

export interface OrderEvent {
  id?: string;
  event_time: string;
  location_lat?: number | null;
  location_lng?: number | null;
  note?: string | null;
  image_url?: string | null;
  order_statuses: OrderStatusSummary | OrderStatusSummary[] | null;
}

export interface TrackingOrder {
  id: string;
  tracking_code: string;
  service_type: string;
  created_at: string;
  order_statuses: OrderStatusSummary | OrderStatusSummary[] | null;
}

export interface TrackingResult {
  order: TrackingOrder;
  events: OrderEvent[];
  warehouseEvents: Array<{
    event_time: string;
    event_type: string;
    note: string | null;
    warehouse: { code: string; name: string; province: string } | null;
    leg: { sequence_no: number; leg_type: string } | null;
  }>;
  blockchainEvents: Array<{
    event_type: string;
    transaction_hash: string | null;
    block_number: number | null;
    created_at: string;
  }>;
}

export function relationValue<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const STATUS_LABEL: Record<string, string> = {
  [OrderStatusCode.CREATED]: "Đã tạo đơn",
  [OrderStatusCode.PENDING_ASSIGNMENT]: "Chờ phân công",
  [OrderStatusCode.ASSIGNED]: "Đã phân công",
  [OrderStatusCode.PICKED_UP]: "Đã lấy hàng",
  [OrderStatusCode.IN_WAREHOUSE]: "Tại kho",
  [OrderStatusCode.IN_TRANSIT]: "Đang vận chuyển",
  [OrderStatusCode.DELIVERING]: "Đang giao hàng",
  [OrderStatusCode.DELIVERED]: "Giao thành công",
  [OrderStatusCode.DELIVERY_FAILED]: "Giao thất bại",
  [OrderStatusCode.REDELIVERY]: "Giao lại",
  [OrderStatusCode.RETURNING]: "Đang hoàn hàng",
  [OrderStatusCode.RETURNED]: "Đã hoàn hàng",
  [OrderStatusCode.CANCELLED]: "Đã hủy",
};

export function statusCode(value: OrderStatusSummary | OrderStatusSummary[] | null): string {
  return relationValue(value)?.code ?? "";
}

export function statusLabel(value: OrderStatusSummary | OrderStatusSummary[] | null): string {
  const status = relationValue(value);
  return STATUS_LABEL[status?.code ?? ""] ?? status?.name ?? "Chưa cập nhật";
}

export function statusClass(value: OrderStatusSummary | OrderStatusSummary[] | null): string {
  switch (statusCode(value)) {
    case OrderStatusCode.DELIVERED:
      return "bg-dt-green/10 text-dt-green";
    case OrderStatusCode.CANCELLED:
    case OrderStatusCode.DELIVERY_FAILED:
      return "bg-dt-red/10 text-red-300";
    case OrderStatusCode.CREATED:
    case OrderStatusCode.ASSIGNED:
      return "bg-dt-yellow/10 text-dt-yellow";
    default:
      return "bg-sky-400/10 text-sky-300";
  }
}

export function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function addressText(address: OrderAddressSummary | null): string {
  if (!address) return "Chưa có địa chỉ";
  return [address.address_line, address.ward, address.district, address.province]
    .filter(Boolean)
    .join(", ");
}
