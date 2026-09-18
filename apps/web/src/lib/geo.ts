import type { LocationSource, MapPoint } from "@delivery/shared";

export interface AddressGeoInput {
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  formatted_address?: string | null;
  location_source?: LocationSource | null;
}

export interface AddressGeoColumns {
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  formatted_address: string | null;
  location_source: LocationSource | null;
  geocoded_at: string | null;
}

const EMPTY_ADDRESS_GEO: AddressGeoColumns = {
  latitude: null,
  longitude: null,
  place_id: null,
  formatted_address: null,
  location_source: null,
  geocoded_at: null,
};

/** Chuyển dữ liệu vị trí client gửi thành các cột lưu DB; không có tọa độ thì xóa trắng. */
export function addressGeoColumns(input: AddressGeoInput): AddressGeoColumns {
  if (input.latitude === undefined || input.latitude === null
    || input.longitude === undefined || input.longitude === null) {
    return EMPTY_ADDRESS_GEO;
  }
  return {
    latitude: input.latitude,
    longitude: input.longitude,
    place_id: input.place_id?.trim() || null,
    formatted_address: input.formatted_address?.trim() || null,
    location_source: input.location_source ?? null,
    geocoded_at: new Date().toISOString(),
  };
}

/**
 * Cột vị trí cần ghi khi cập nhật địa chỉ.
 *
 * Client gửi tọa độ mới thì dùng tọa độ đó. Nếu chỉ sửa chữ (số nhà, phường,
 * tỉnh) mà không gửi ghim mới, ghim cũ không còn đúng nên phải xóa để bản đồ
 * không chỉ sai chỗ. Không đổi gì liên quan vị trí thì giữ nguyên.
 */
export function addressGeoChanges(
  input: AddressGeoInput & { address_line?: string; ward?: string; district?: string; province?: string },
): Partial<AddressGeoColumns> {
  if (input.latitude !== undefined || input.longitude !== undefined) return addressGeoColumns(input);
  const addressTextChanged = [input.address_line, input.ward, input.district, input.province]
    .some((value) => value !== undefined);
  return addressTextChanged ? EMPTY_ADDRESS_GEO : {};
}

export function toMapPoint(latitude: number | null | undefined, longitude: number | null | undefined): MapPoint | null {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  return { latitude, longitude };
}

const EARTH_RADIUS_M = 6371008.8;

/** Khoảng cách đường chim bay giữa hai điểm (mét), công thức Haversine. */
export function distanceMeters(a: MapPoint, b: MapPoint): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type WarehouseGeoColumns = Pick<AddressGeoColumns, "latitude" | "longitude" | "place_id" | "geocoded_at">;

/** Cột vị trí khi tạo kho. */
export function warehouseGeoColumns(input: AddressGeoInput): WarehouseGeoColumns {
  const { latitude, longitude, place_id, geocoded_at } = addressGeoColumns(input);
  return { latitude, longitude, place_id, geocoded_at };
}

/** Cột vị trí khi sửa kho, cùng quy tắc xóa ghim cũ như addressGeoChanges. */
export function warehouseGeoChanges(
  input: AddressGeoInput & { address_line?: string; ward?: string | null; district?: string | null; province?: string },
): Partial<WarehouseGeoColumns> {
  if (input.latitude !== undefined || input.longitude !== undefined) return warehouseGeoColumns(input);
  const addressTextChanged = [input.address_line, input.ward, input.district, input.province]
    .some((value) => value !== undefined);
  return addressTextChanged ? warehouseGeoColumns({}) : {};
}

/** Độ lệch đồng hồ thiết bị shipper chấp nhận được so với server. */
export const COURIER_CLOCK_SKEW_MS = 2 * 60 * 1000;
