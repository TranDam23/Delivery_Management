export interface OrderStatus {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_final: boolean;
}

export interface Order {
  id: string;
  tracking_code: string;
  qr_code: string;
  sender_id: string;
  receiver_id: string;
  pickup_address_id: string;
  delivery_address_id: string;
  service_type: string;
  cod_amount: number;
  total_fee: number;
  status_id: string;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  cancel_reason: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_name: string;
  item_type: string | null;
  quantity: number;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  declared_value: number | null;
  note: string | null;
}
