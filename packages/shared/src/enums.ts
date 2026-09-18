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

export const WarehouseStatusCode = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type WarehouseStatusCode = (typeof WarehouseStatusCode)[keyof typeof WarehouseStatusCode];

export const WarehouseLevelCode = {
  /** Trung tâm khai thác/phân loại phục vụ nhiều tỉnh trong một vùng. */
  REGIONAL: "REGIONAL",
  PROVINCE: "PROVINCE",
  COMMUNE: "COMMUNE",
} as const;
export type WarehouseLevelCode = (typeof WarehouseLevelCode)[keyof typeof WarehouseLevelCode];

export const ShipmentLegType = {
  PICKUP: "PICKUP",
  TRANSFER: "TRANSFER",
  LAST_MILE: "LAST_MILE",
} as const;
export type ShipmentLegType = (typeof ShipmentLegType)[keyof typeof ShipmentLegType];

export const ShipmentLegStatusCode = {
  PENDING: "PENDING",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type ShipmentLegStatusCode =
  (typeof ShipmentLegStatusCode)[keyof typeof ShipmentLegStatusCode];

export const WarehouseEventType = {
  INBOUND: "INBOUND",
  OUTBOUND: "OUTBOUND",
} as const;
export type WarehouseEventType = (typeof WarehouseEventType)[keyof typeof WarehouseEventType];

/** Kết quả kiểm tình trạng kiện hàng khi nhập kho. */
export const PackageCondition = {
  INTACT: "INTACT",
  DAMAGED: "DAMAGED",
} as const;
export type PackageCondition = (typeof PackageCondition)[keyof typeof PackageCondition];

/** Cac moc quan trong duoc ghi len Blockchain (khop voi blockchain_events.event_type) */
export const BlockchainEventType = {
  ORDER_CREATED: "ORDER_CREATED",
  PICKED_UP: "PICKED_UP",
  /** Shipper không lấy được hàng tại địa chỉ người gửi. */
  PICKUP_FAILED: "PICKUP_FAILED",
  IN_WAREHOUSE: "IN_WAREHOUSE",
  IN_TRANSIT: "IN_TRANSIT",
  /** Shipper đã nhận hàng tại kho phát và bắt đầu giao. */
  DELIVERING: "DELIVERING",
  DELIVERED: "DELIVERED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
  /** Đơn hết số lần giao, bắt đầu tuyến hoàn về người gửi. */
  RETURNING: "RETURNING",
  RETURNED: "RETURNED",
  /** Người nhận xác nhận đã nhận hàng trên hệ thống. */
  RECEIVER_CONFIRMED: "RECEIVER_CONFIRMED",
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
  /** Tai khoan van hanh nhap/xuat tai mot kho cu the. */
  WAREHOUSE_STAFF: "WAREHOUSE_STAFF",
  /** Tai khoan khach hang co the vua gui vua nhan hang. */
  CUSTOMER: "CUSTOMER",
} as const;
export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

/** Ma role cu chi dung trong migration va tuong thich tai khoan da ton tai. */
export const LegacyRoleCode = {
  SENDER: "SENDER",
  RECEIVER: "RECEIVER",
} as const;
export type LegacyRoleCode = (typeof LegacyRoleCode)[keyof typeof LegacyRoleCode];

/** Nguồn tọa độ của một địa chỉ, dùng để đánh giá độ tin cậy khi hiển thị bản đồ. */
export const LocationSource = {
  /** Người dùng tự kéo ghim trên bản đồ. */
  MAP_PIN: "MAP_PIN",
  /** Chọn từ gợi ý Google Places (có place_id). */
  PLACES: "PLACES",
  /** Hệ thống geocode từ chuỗi địa chỉ, độ chính xác thấp hơn. */
  GEOCODED: "GEOCODED",
  /** Lấy từ GPS thiết bị tại chỗ. */
  DEVICE_GPS: "DEVICE_GPS",
} as const;
export type LocationSource = (typeof LocationSource)[keyof typeof LocationSource];
