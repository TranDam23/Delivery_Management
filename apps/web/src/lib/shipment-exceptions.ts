import { ShipmentLegType, WarehouseLevelCode, WarehouseStatusCode } from "@delivery/shared";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const ExceptionType = {
  WRONG_WAREHOUSE: "WRONG_WAREHOUSE",
  WRONG_AREA: "WRONG_AREA",
  TRANSFER_FAILED: "TRANSFER_FAILED",
  REASSIGNED: "REASSIGNED",
} as const;
export type ExceptionType = (typeof ExceptionType)[keyof typeof ExceptionType];

export interface TreeWarehouse {
  id: string;
  code: string;
  name: string;
  province: string;
  status: string;
  warehouse_level: string;
  parent_warehouse_id: string | null;
}

export interface PlannedNewLeg {
  leg_type: string;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  responsibility_province: string | null;
}

const COLUMNS = "id, code, name, province, status, warehouse_level, parent_warehouse_id";

async function loadWarehouse(id: string): Promise<TreeWarehouse | null> {
  const { data } = await getSupabaseServiceClient().from("warehouses").select(COLUMNS).eq("id", id).maybeSingle();
  return (data as TreeWarehouse | null) ?? null;
}

/** Kho cha trực tiếp (kho con → kho tỉnh → trung tâm vùng). */
async function parentOf(warehouse: TreeWarehouse): Promise<TreeWarehouse | null> {
  return warehouse.parent_warehouse_id ? loadWarehouse(warehouse.parent_warehouse_id) : null;
}

/** Cha cấp tỉnh và trung tâm vùng của một kho bất kỳ trong cây. */
async function ancestors(warehouse: TreeWarehouse): Promise<{ province: TreeWarehouse | null; regional: TreeWarehouse | null }> {
  if (warehouse.warehouse_level === WarehouseLevelCode.REGIONAL) return { province: null, regional: warehouse };
  if (warehouse.warehouse_level === WarehouseLevelCode.PROVINCE) return { province: warehouse, regional: await parentOf(warehouse) };
  const province = await parentOf(warehouse);
  return { province, regional: province ? await parentOf(province) : null };
}

/**
 * Lập các chặng còn lại từ kho đang giữ hàng đến kho giao cuối: đi lên kho tỉnh
 * (và trung tâm vùng khi khác vùng), rồi đi xuống kho giao, kết thúc bằng chặng giao cuối.
 * Cùng quy tắc với bộ lập tuyến tự động nhưng xuất phát từ một kho bất kỳ.
 */
export async function planLegsFromWarehouse(
  sourceId: string,
  deliveryWarehouseId: string,
): Promise<{ legs: PlannedNewLeg[]; error: string | null }> {
  const [source, target] = await Promise.all([loadWarehouse(sourceId), loadWarehouse(deliveryWarehouseId)]);
  if (!source) return { legs: [], error: "Không tìm thấy kho đang giữ hàng" };
  if (!target) return { legs: [], error: "Không tìm thấy kho giao hàng" };
  if (target.status !== WarehouseStatusCode.ACTIVE) return { legs: [], error: "Kho giao hàng đang tạm dừng" };
  if (target.warehouse_level !== WarehouseLevelCode.COMMUNE) return { legs: [], error: "Kho giao hàng phải là kho con cấp xã/phường" };
  if (source.status !== WarehouseStatusCode.ACTIVE) return { legs: [], error: "Kho đang giữ hàng đang tạm dừng" };

  const [from, to] = await Promise.all([ancestors(source), ancestors(target)]);
  if (!to.province) return { legs: [], error: "Kho giao hàng chưa có kho tỉnh cha" };

  const path: TreeWarehouse[] = [source];
  const push = (warehouse: TreeWarehouse | null): void => {
    if (warehouse && path[path.length - 1]?.id !== warehouse.id) path.push(warehouse);
  };

  if (source.warehouse_level === WarehouseLevelCode.COMMUNE) push(from.province);
  const sameProvince = Boolean(from.province && from.province.id === to.province.id);
  if (!sameProvince) {
    const crossRegion = Boolean(from.regional && to.regional && from.regional.id !== to.regional.id);
    if (crossRegion || source.warehouse_level === WarehouseLevelCode.REGIONAL) {
      push(from.regional);
      push(to.regional);
    }
    push(to.province);
  }
  push(target);

  const legs: PlannedNewLeg[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index]!;
    const next = path[index + 1]!;
    legs.push({
      leg_type: ShipmentLegType.TRANSFER,
      from_warehouse_id: current.id,
      to_warehouse_id: next.id,
      responsibility_province: current.province || next.province,
    });
  }
  legs.push({
    leg_type: ShipmentLegType.LAST_MILE,
    from_warehouse_id: target.id,
    to_warehouse_id: null,
    responsibility_province: target.province,
  });
  return { legs, error: null };
}
