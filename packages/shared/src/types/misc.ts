import type { AlertStatus, NotificationType } from "../enums";

export interface Alert {
  id: string;
  order_id: string | null;
  alert_type: string;
  title: string;
  message: string;
  details: Record<string, unknown> | null;
  detected_at: string;
  status: AlertStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  order_id: string | null;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  updated_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
