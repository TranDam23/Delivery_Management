/** Loại shipper và nhãn hiển thị dùng chung cho giao diện và máy chủ (không phụ thuộc cơ sở dữ liệu). */
export type ShipperType = "PICKUP" | "DELIVERY" | "BOTH";

export const SHIPPER_TYPE_LABEL: Record<ShipperType, string> = {
  PICKUP: "Lấy hàng",
  DELIVERY: "Giao hàng",
  BOTH: "Lấy và giao hàng",
};

/** Dữ liệu shipper trả về từ /api/delivery-staff. */
export interface ShipperLoad {
  shipper_type?: ShipperType;
  daily_limit?: number;
  assigned_today?: number;
}

/** Shipper loại này có được nhận chặng loại này không (chặng trung chuyển do kho xử lý nên luôn được). */
export function shipperTypeAllows(shipperType: ShipperType, legType: string): boolean {
  if (legType === "PICKUP") return shipperType !== "DELIVERY";
  if (legType === "LAST_MILE") return shipperType !== "PICKUP";
  return true;
}

export function shipperIsFull(member: ShipperLoad): boolean {
  return member.daily_limit !== undefined && member.assigned_today !== undefined && member.assigned_today >= member.daily_limit;
}

/** Nhãn trong danh sách chọn: tên, số điện thoại và số đơn đã phân công hôm nay / giới hạn. */
export function shipperOptionLabel(member: ShipperLoad & { full_name: string; phone?: string | null }): string {
  const load = member.daily_limit !== undefined && member.assigned_today !== undefined
    ? ` · ${member.assigned_today}/${member.daily_limit} đơn hôm nay${shipperIsFull(member) ? " · ĐÃ ĐỦ" : ""}`
    : "";
  return `${member.full_name}${member.phone ? ` · ${member.phone}` : ""}${load}`;
}

/** Cảnh báo cho điều phối viên khi có shipper đã đủ đơn trong danh sách ứng viên của một chặng. */
export function fullShipperWarning(candidates: Array<ShipperLoad & { full_name: string }>): string | null {
  const full = candidates.filter(shipperIsFull);
  if (full.length === 0) return null;
  return `${full.map((member) => member.full_name).join(", ")} đã đủ số đơn trong ngày hôm nay, không chọn được. Hãy chọn shipper khác.`;
}
