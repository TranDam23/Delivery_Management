/** Ma trang thai don hang chuan (seed vao bang order_statuses.code) */
export const OrderStatusCode = {
  CREATED: "CREATED",
  PENDING_ASSIGNMENT: "PENDING_ASSIGNMENT",
  ASSIGNED: "ASSIGNED",
  PICKED_UP: "PICKED_UP",
  IN_WAREHOUSE: "IN_WAREHOUSE",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERING: "DELIVERING",
  DELIVERED: "DELIVERED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
  REDELIVERY: "REDELIVERY",
  RETURNING: "RETURNING",
  RETURNED: "RETURNED",
  CANCELLED: "CANCELLED",
} as const;
export type OrderStatusCode = (typeof OrderStatusCode)[keyof typeof OrderStatusCode];

/** Cac moc quan trong duoc ghi len Blockchain (khop voi blockchain_events.event_type) */
export const BlockchainEventType = {
  ORDER_CREATED: "ORDER_CREATED",
  PICKED_UP: "PICKED_UP",
  IN_WAREHOUSE: "IN_WAREHOUSE",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
  RETURNED: "RETURNED",
  CANCELLED: "CANCELLED",
} as const;
export type BlockchainEventType = (typeof BlockchainEventType)[keyof typeof BlockchainEventType];

export const ContactType = {
  SENDER: "sender",
  RECEIVER: "receiver",
  /** Mot lien he vua nhan hang vua gui hang — dac ta muc 10 "Ca hai". */
  BOTH: "both",
} as const;
export type ContactType = (typeof ContactType)[keyof typeof ContactType];

export const DeliveryAttemptResult = {
  SUCCESS: "success",
  FAILED: "failed",
} as const;
export type DeliveryAttemptResult = (typeof DeliveryAttemptResult)[keyof typeof DeliveryAttemptResult];

export const CodTransactionStatus = {
  PENDING: "pending",
  COLLECTED: "collected",
  RECONCILED: "reconciled",
} as const;
export type CodTransactionStatus = (typeof CodTransactionStatus)[keyof typeof CodTransactionStatus];

/** Trạng thái giao dịch ghi Blockchain bất đồng bộ trong DB. */
export const BlockchainTransactionStatus = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  FAILED: "failed",
} as const;
export type BlockchainTransactionStatus =
  (typeof BlockchainTransactionStatus)[keyof typeof BlockchainTransactionStatus];

/** Vòng đời xử lý của một cảnh báo bất thường. */
export const AlertStatus = {
  OPEN: "open",
  ACKNOWLEDGED: "acknowledged",
  RESOLVED: "resolved",
  DISMISSED: "dismissed",
} as const;
export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];

export const UserStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const NotificationType = {
  ORDER_STATUS_CHANGED: "order_status_changed",
  DELIVERY_DELAYED: "delivery_delayed",
  DELIVERY_ABNORMAL: "delivery_abnormal",
  DELIVERY_SUCCESS: "delivery_success",
  COD_RECONCILED: "cod_reconciled",
  SYSTEM: "system",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** Ma quyen chuan he thong (seed vao bang permissions.code), module = nhom chuc nang */
export const RoleCode = {
  ADMIN: "ADMIN",
  DISPATCHER: "DISPATCHER",
  DELIVERY_STAFF: "DELIVERY_STAFF",
  SENDER: "SENDER",
  RECEIVER: "RECEIVER",
} as const;
export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];
