export type ProgressPhase =
  | "NOT_PICKED_UP" // Hàng còn ở người gửi, chưa lấy
  | "PICKING_UP" // Shipper đang đi lấy hàng
  | "AT_WAREHOUSE" // Hàng đang nằm ở một kho
  | "IN_TRANSIT" // Đang chuyển giữa hai kho
  | "DELIVERING" // Shipper đang giao cho người nhận
  | "DELIVERY_FAILED" // Giao không thành công, hàng đang về kho phát hoặc chờ xử lý
  | "COMPLETED" // Đã giao xong (hoặc đã hoàn xong)
  | "CANCELLED";

export interface ProgressLeg {
  sequence: number;
  type: "PICKUP" | "TRANSFER" | "LAST_MILE";
  isReturn: boolean;
  status: string;
  from: string | null;
  to: string | null;
  /** Tên nhân viên (chỉ Admin/điều phối viên được xem) hoặc vai trò khi bị ẩn danh; null nếu chưa phân công. */
  staff: string | null;
  staffNameHidden: boolean;
  attemptNo: number;
}

export interface OrderProgress {
  phase: ProgressPhase;
  /** Đơn đang trong tuyến hoàn hàng. */
  returning: boolean;
  currentWarehouse: { name: string; province: string } | null;
  transit: { from: string; to: string } | null;
  /** Chặng đang thực hiện; nếu chưa có thì là chặng kế tiếp chờ thực hiện. */
  currentLeg: ProgressLeg | null;
  currentLegIsNext: boolean;
  legs: ProgressLeg[];
  legsDone: number;
  legsTotal: number;
}
