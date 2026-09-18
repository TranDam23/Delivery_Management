import { ShipmentLegStatusCode, ShipmentLegType } from "@delivery/shared";
import { distanceMeters, toMapPoint } from "@/lib/geo";

export interface RouteWarehouse {
  id: string;
  code: string;
  name: string;
  province: string;
  district: string | null;
  ward: string | null;
  warehouse_level?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface RouteAddress {
  province: string | null;
  district: string | null;
  ward: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface RouteLegLocation {
  leg_type: string;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  responsibility_province?: string | null;
}

/** Chuẩn hóa tên khu vực để so sánh dữ liệu nhập khác kiểu viết. */
export function normalizeArea(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(thanh pho|tp|tinh|phuong|xa|p|dac khu|thi tran)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function sameProvince(address: RouteAddress, warehouse: RouteWarehouse): boolean {
  const addressProvince = normalizeArea(address.province);
  const warehouseProvince = normalizeArea(warehouse.province);
  return Boolean(addressProvince && warehouseProvince && addressProvince === warehouseProvince);
}

/** So sánh tỉnh/thành phố sau khi bỏ tiền tố và khác biệt dấu tiếng Việt. */
export function matchesProvince(value: string | null | undefined, province: string | null | undefined): boolean {
  const normalizedValue = normalizeArea(value);
  const normalizedProvince = normalizeArea(province);
  return Boolean(normalizedValue && normalizedProvince && normalizedValue === normalizedProvince);
}

export function sameWard(address: RouteAddress, warehouse: RouteWarehouse): boolean {
  const addressWard = normalizeArea(address.ward);
  const warehouseWard = normalizeArea(warehouse.ward);
  return Boolean(addressWard && warehouseWard && addressWard === warehouseWard);
}

export function sameDistrict(address: RouteAddress, warehouse: RouteWarehouse): boolean {
  const addressDistrict = normalizeArea(address.district);
  const warehouseDistrict = normalizeArea(warehouse.district);
  return Boolean(addressDistrict && warehouseDistrict && addressDistrict === warehouseDistrict);
}

/**
 * Chấm điểm mức độ phù hợp của kho con với địa chỉ.
 *
 * Điểm thấp hơn nghĩa là phù hợp hơn:
 * 0 = cùng tỉnh, quận/huyện và xã/phường;
 * 1 = cùng tỉnh và quận/huyện;
 * 2 = cùng tỉnh và cùng xã/phường nhưng dữ liệu quận/huyện ở một phía bị thiếu;
 * 3 = cùng tỉnh, dùng kho hoạt động đầu tiên theo mã kho làm phương án dự phòng;
 * 4 = khác tên tỉnh nhưng trùng xã/phường, dùng để tương thích địa chỉ cũ
 *     (ví dụ Google Maps vẫn trả về tên tỉnh trước khi sáp nhập).
 * null = không đủ dữ liệu để đối chiếu.
 */
export function warehouseMatchScore(
  address: RouteAddress,
  warehouse: RouteWarehouse,
): number | null {
  const provinceMatches = sameProvince(address, warehouse);
  const districtMatches = sameDistrict(address, warehouse);
  const wardMatches = sameWard(address, warehouse);
  const addressDistrict = normalizeArea(address.district);
  const warehouseDistrict = normalizeArea(warehouse.district);

  if (provinceMatches && districtMatches && wardMatches) return 0;
  if (provinceMatches && districtMatches) return 1;
  // Chỉ coi xã/phường là một mức khớp riêng khi không thể đối chiếu quận/huyện.
  // Tránh chọn nhầm hai xã trùng tên nhưng thuộc hai quận/huyện khác nhau.
  if (provinceMatches && wardMatches && (!addressDistrict || !warehouseDistrict)) return 2;
  if (provinceMatches) return 3;
  // Khi tên tỉnh trong địa chỉ là tên cũ, xã/phường là khóa địa giới còn
  // đủ tin cậy để nối sang kho hiện đang mang tên tỉnh mới. Không fallback
  // chỉ theo quận/huyện vì tên quận/huyện có thể trùng giữa nhiều tỉnh.
  if (wardMatches && (!addressDistrict || !warehouseDistrict || districtMatches)) return 4;
  return null;
}

/**
 * Chọn điểm thu gom/phát phù hợp nhất với một địa chỉ.
 *
 * Dữ liệu kho hiện tại chưa có tọa độ vận hành riêng, vì vậy "gần nhất" được
 * xác định theo cây địa giới hành chính: cùng xã/phường + quận/huyện, cùng
 * quận/huyện, rồi fallback về một kho hoạt động trong cùng tỉnh. Mức cuối
 * cùng hỗ trợ tên tỉnh cũ nếu xã/phường trùng với dữ liệu kho hiện tại.
 *
 * Địa giới hành chính vẫn là tiêu chí chính vì mỗi kho phụ trách một vùng
 * phục vụ. Khi địa chỉ và kho đã có tọa độ, các kho cùng mức điểm được xếp
 * theo khoảng cách Haversine thay cho thứ tự mã kho.
 */
export function selectNearestWarehouse<T extends RouteWarehouse>(
  address: RouteAddress,
  warehouses: T[],
): T | null {
  const addressPoint = toMapPoint(address.latitude, address.longitude);
  const distanceTo = (warehouse: T): number => {
    const warehousePoint = toMapPoint(warehouse.latitude, warehouse.longitude);
    return addressPoint && warehousePoint ? distanceMeters(addressPoint, warehousePoint) : Number.POSITIVE_INFINITY;
  };
  const candidates = warehouses
    .map((warehouse) => ({ warehouse, score: warehouseMatchScore(address, warehouse), distance: distanceTo(warehouse) }))
    .filter((candidate): candidate is { warehouse: T; score: number; distance: number } => candidate.score !== null)
    .sort((left, right) => left.score - right.score
      || (left.distance === right.distance ? 0 : left.distance < right.distance ? -1 : 1)
      || left.warehouse.code.localeCompare(right.warehouse.code))
    .map((candidate) => candidate.warehouse);

  return candidates[0] ?? null;
}

/**
 * Xác định tỉnh chịu trách nhiệm cho một chặng.
 *
 * Chặng lấy hàng thuộc tỉnh của kho con nhận hàng; chặng giao cuối thuộc
 * tỉnh của kho con giao hàng; chặng trung chuyển thuộc tỉnh của kho xuất.
 * Quy tắc này giúp hai điều phối viên đầu gửi/đầu nhận không phân công trùng
 * cùng một chặng của đơn liên tỉnh.
 */
export function legResponsibilityProvince(
  leg: RouteLegLocation,
  warehouseById: Map<string, { province: string | null }>,
): string | null {
  if (leg.responsibility_province?.trim()) return leg.responsibility_province.trim();

  const fromProvince = leg.from_warehouse_id
    ? warehouseById.get(leg.from_warehouse_id)?.province ?? null
    : null;
  const toProvince = leg.to_warehouse_id
    ? warehouseById.get(leg.to_warehouse_id)?.province ?? null
    : null;

  if (leg.leg_type === ShipmentLegType.PICKUP) return toProvince;
  if (leg.leg_type === ShipmentLegType.LAST_MILE) return fromProvince;
  return fromProvince ?? toProvince;
}

export function legTypeLabel(legType: string, isReturn = false): string {
  switch (legType) {
    case ShipmentLegType.PICKUP:
      return "Lấy hàng";
    case ShipmentLegType.TRANSFER:
      return isReturn ? "Chuyển kho (hoàn hàng)" : "Chuyển kho";
    case ShipmentLegType.LAST_MILE:
      return isReturn ? "Giao hoàn cho người gửi" : "Giao chặng cuối";
    default:
      return legType;
  }
}

export function legStatusLabel(status: string): string {
  switch (status) {
    case ShipmentLegStatusCode.PENDING:
      return "Chờ phân công";
    case ShipmentLegStatusCode.ASSIGNED:
      return "Đã phân công";
    case ShipmentLegStatusCode.IN_PROGRESS:
      return "Đang thực hiện";
    case ShipmentLegStatusCode.COMPLETED:
      return "Đã hoàn tất";
    case ShipmentLegStatusCode.FAILED:
      return "Thất bại";
    case ShipmentLegStatusCode.CANCELLED:
      return "Đã hủy";
    default:
      return status;
  }
}
