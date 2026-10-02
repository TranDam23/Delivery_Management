import { WarehouseStatusCode } from "@delivery/shared";
import type { DatabaseService } from "@/database/database.service";

export interface ActiveWarehouse {
  id: string;
  code: string;
  name: string;
  province: string;
  ward: string | null;
  district: string | null;
  warehouse_level: string;
  parent_warehouse_id: string | null;
  region_code: string | null;
}

export class WarehouseRepository {
  constructor(private readonly database: DatabaseService) {}

  async listActive(): Promise<ActiveWarehouse[]> {
    const { data, error } = await this.database
      .getClient()
      .from("warehouses")
      .select("id, code, name, province, ward, district, warehouse_level, parent_warehouse_id, region_code")
      .eq("status", WarehouseStatusCode.ACTIVE)
      .order("province")
      .order("warehouse_level")
      .order("name");

    if (error) throw new Error("Failed to load warehouses");
    return (data ?? []) as ActiveWarehouse[];
  }
}
