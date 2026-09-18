import type {
  ShipmentLegStatusCode,
  ShipmentLegType,
  WarehouseEventType,
  WarehouseLevelCode,
  WarehouseStatusCode,
} from "../enums";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address_line: string;
  ward: string | null;
  district: string | null;
  province: string;
  capacity: number | null;
  status: WarehouseStatusCode;
  warehouse_level: WarehouseLevelCode;
  parent_warehouse_id: string | null;
  region_code: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  geocoded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentLeg {
  id: string;
  order_id: string;
  sequence_no: number;
  leg_type: ShipmentLegType;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  assigned_staff_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  responsibility_province: string | null;
  status: ShipmentLegStatusCode;
  started_at: string | null;
  completed_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarehouseEvent {
  id: string;
  order_id: string;
  shipment_leg_id: string;
  warehouse_id: string;
  event_type: WarehouseEventType;
  performed_by: string;
  event_time: string;
  note: string | null;
}
