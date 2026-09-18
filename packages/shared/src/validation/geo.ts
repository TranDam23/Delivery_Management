import { z } from "zod";
import { LocationSource } from "../enums";

/**
 * Trường vị trí dùng chung cho địa chỉ và kho. Tất cả đều tùy chọn để form
 * nhập tay hiện tại vẫn chạy; khi có Google Maps, client gửi thêm tọa độ ghim
 * và place_id của Places API.
 */
export const geoPointFields = {
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  place_id: z.string().trim().max(300).nullable().optional(),
};

export const addressGeoFields = {
  ...geoPointFields,
  formatted_address: z.string().trim().max(500).nullable().optional(),
  location_source: z.enum([
    LocationSource.MAP_PIN,
    LocationSource.PLACES,
    LocationSource.GEOCODED,
    LocationSource.DEVICE_GPS,
  ]).nullable().optional(),
};

/** Vĩ độ và kinh độ phải đi cùng nhau: có cả hai hoặc bỏ trống cả hai. */
export function refineCoordinatePair(
  value: { latitude?: number | null; longitude?: number | null },
  context: z.RefinementCtx,
): void {
  const hasLatitude = value.latitude !== undefined && value.latitude !== null;
  const hasLongitude = value.longitude !== undefined && value.longitude !== null;
  if (hasLatitude !== hasLongitude) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasLatitude ? "longitude" : "latitude"],
      message: "Vĩ độ và kinh độ phải được gửi cùng nhau",
    });
  }
}

/** Vị trí shipper gửi lên định kỳ khi đang thực hiện chặng. */
export const courierLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().nonnegative().max(100000).optional(),
  heading_deg: z.number().min(0).lt(360).optional(),
  speed_mps: z.number().nonnegative().max(100).optional(),
  /** Thời điểm thiết bị đo; server chặn giá trị ở tương lai. */
  recorded_at: z.string().datetime({ offset: true }).optional(),
});

export type CourierLocationInput = z.infer<typeof courierLocationSchema>;
