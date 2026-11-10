import { ShipmentLegStatusCode, ShipmentLegType } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { SHIPPER_TYPE_LABEL, shipperTypeAllows, type ShipperType } from "@/lib/shipper-ui";

export { SHIPPER_TYPE_LABEL, shipperTypeAllows, type ShipperType };

export const DEFAULT_DAILY_LIMIT = 20;
export const SHIPPER_LIMIT_SETTING = "SHIPPER_DAILY_ASSIGNMENT_LIMIT";

export interface ShipperCapacity {
  shipperType: ShipperType;
  /** Giới hạn đơn mỗi ngày đang áp dụng (riêng hoặc mặc định). */
  dailyLimit: number;
  /** Số chặng đã phân công cho shipper trong ngày hôm nay (giờ Việt Nam). */
  assignedToday: number;
}

/** Thời điểm 00:00 hôm nay theo giờ Việt Nam (UTC+7), dưới dạng ISO UTC. */
export function vietnamDayStartIso(now: Date = new Date()): string {
  const offsetMs = 7 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(startLocal - offsetMs).toISOString();
}

function normalizeType(value: unknown): ShipperType {
  return value === "PICKUP" || value === "DELIVERY" ? value : "BOTH";
}

/**
 * Tải loại shipper, giới hạn và số đơn đã phân công hôm nay. Nếu chưa chạy migration (thiếu cột loại/giới hạn)
 * thì coi mọi shipper là "lấy và giao" với giới hạn mặc định, nên việc phân công vẫn hoạt động.
 */
export async function loadShipperCapacities(staffIds: string[]): Promise<Map<string, ShipperCapacity>> {
  const result = new Map<string, ShipperCapacity>();
  if (staffIds.length === 0) return result;
  const supabase = getSupabaseServiceClient();

  let defaultLimit = DEFAULT_DAILY_LIMIT;
  const { data: setting } = await supabase.from("system_settings").select("value").eq("key", SHIPPER_LIMIT_SETTING).maybeSingle();
  const parsedDefault = Number(setting?.value);
  if (Number.isInteger(parsedDefault) && parsedDefault > 0) defaultLimit = parsedDefault;

  const profiles = new Map<string, { type: ShipperType; limit: number | null }>();
  const { data: profileRows, error: profileError } = await supabase
    .from("users")
    .select("id, shipper_type, daily_assignment_limit")
    .in("id", staffIds);
  if (!profileError) {
    for (const row of profileRows ?? []) {
      profiles.set(row.id, { type: normalizeType(row.shipper_type), limit: row.daily_assignment_limit ?? null });
    }
  }

  const counts = new Map<string, number>();
  const { data: legRows } = await supabase
    .from("shipment_legs")
    .select("assigned_staff_id")
    .in("assigned_staff_id", staffIds)
    .neq("status", ShipmentLegStatusCode.CANCELLED)
    .gte("assigned_at", vietnamDayStartIso());
  for (const row of legRows ?? []) {
    if (row.assigned_staff_id) counts.set(row.assigned_staff_id, (counts.get(row.assigned_staff_id) ?? 0) + 1);
  }

  for (const id of staffIds) {
    const profile = profiles.get(id);
    result.set(id, {
      shipperType: profile?.type ?? "BOTH",
      dailyLimit: profile?.limit ?? defaultLimit,
      assignedToday: counts.get(id) ?? 0,
    });
  }
  return result;
}

export type ShipperCheck =
  | { ok: true; capacity: ShipperCapacity }
  | { ok: false; status: 409; error: string; capacity: ShipperCapacity };

/**
 * Kiểm tra trước khi phân công một chặng cho shipper: đúng loại shipper và chưa đủ số đơn trong ngày.
 * Nếu chặng đang thuộc chính shipper này (giao lại, sửa) thì không tính thêm đơn.
 */
export async function checkShipperCanTake(
  staffId: string,
  staffName: string | null,
  leg: { leg_type: string; assigned_staff_id?: string | null },
): Promise<ShipperCheck> {
  const capacity = (await loadShipperCapacities([staffId])).get(staffId)
    ?? { shipperType: "BOTH" as ShipperType, dailyLimit: DEFAULT_DAILY_LIMIT, assignedToday: 0 };
  const name = staffName ? `Shipper ${staffName}` : "Shipper này";

  if (!shipperTypeAllows(capacity.shipperType, leg.leg_type)) {
    const need = leg.leg_type === ShipmentLegType.PICKUP ? "lấy hàng" : "giao hàng";
    return { ok: false, status: 409, capacity, error: `${name} thuộc nhóm ${SHIPPER_TYPE_LABEL[capacity.shipperType].toLowerCase()}, không nhận chặng ${need}. Hãy chọn shipper ${need}.` };
  }
  if (leg.assigned_staff_id !== staffId && capacity.assignedToday >= capacity.dailyLimit) {
    return {
      ok: false, status: 409, capacity,
      error: `${name} đã đủ ${capacity.dailyLimit}/${capacity.dailyLimit} đơn trong ngày hôm nay. Hãy chọn shipper khác để phân công.`,
    };
  }
  return { ok: true, capacity };
}

/** Đổi lỗi từ trigger cơ sở dữ liệu thành thông báo thân thiện (dùng khi hai điều phối viên phân công cùng lúc). */
export function friendlyCapacityError(message: string): string | null {
  if (message.includes("SHIPPER_DAILY_LIMIT_REACHED")) return "Shipper đã đủ số đơn trong ngày hôm nay. Hãy chọn shipper khác để phân công.";
  if (message.includes("SHIPPER_TYPE_MISMATCH")) return "Shipper không thuộc loại phù hợp với chặng này (lấy hàng hoặc giao hàng).";
  return null;
}
