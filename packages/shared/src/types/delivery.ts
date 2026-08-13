import type { DeliveryAttemptResult } from "../enums";

export interface Delivery {
  id: string;
  order_id: string;
  delivery_staff_id: string;
  assigned_by: string;
  assigned_at: string;
  received_at: string | null;
  is_return: boolean;
}

export interface DeliveryEvent {
  id: string;
  delivery_id: string;
  order_id: string;
  status_id: string;
  performed_by: string;
  event_time: string;
  location_lat: number | null;
  location_lng: number | null;
  note: string | null;
  image_url: string | null;
}

export interface DeliveryAttempt {
  id: string;
  delivery_id: string;
  attempt_no: number;
  attempt_time: string;
  result: DeliveryAttemptResult;
  reason_fail: string | null;
  note: string | null;
}
