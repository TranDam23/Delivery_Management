import type { LocationSource, ShipmentLegType, WarehouseLevelCode } from "../enums";

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export type OrderMapStopKind = "PICKUP_ADDRESS" | "WAREHOUSE" | "DELIVERY_ADDRESS";

/** Một điểm trên hành trình: địa chỉ người gửi, các kho đi qua, địa chỉ người nhận. */
export interface OrderMapStop {
  kind: OrderMapStopKind;
  label: string;
  address: string;
  /** null khi điểm chưa có tọa độ; client vẫn liệt kê nhưng không ghim lên bản đồ. */
  point: MapPoint | null;
  location_source: LocationSource | null;
  warehouse_id: string | null;
  warehouse_level: WarehouseLevelCode | null;
  /** Hàng đã đi qua (hoặc đang ở) điểm này chưa. */
  reached: boolean;
}

export interface CourierPosition {
  point: MapPoint;
  accuracy_m: number | null;
  heading_deg: number | null;
  recorded_at: string;
  shipment_leg_id: string;
  leg_type: ShipmentLegType;
}

/** Dữ liệu cho màn bản đồ theo dõi đơn, kiểu Shopee/TikTok Shop. */
export interface OrderMapData {
  order_id: string;
  tracking_code: string;
  status_code: string;
  /** Tuyến chiều hoàn nếu đơn đang hoàn hàng. */
  is_returning: boolean;
  stops: OrderMapStop[];
  /** Vị trí mới nhất của shipper, chỉ có khi đang lấy hàng hoặc đang giao. */
  courier: CourierPosition | null;
  /** Vệt di chuyển gần đây của shipper trong chặng hiện tại, cũ → mới. */
  courier_trail: MapPoint[];
  /** Số điểm chưa có tọa độ, để UI nhắc bổ sung ghim. */
  missing_coordinates: number;
}
