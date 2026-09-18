import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { WarehouseOverviewPage } from "@/components/warehouse/warehouse-overview";

export default function WarehouseDashboardPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.WAREHOUSE_STAFF}>
      <RolePageShell roleCode={RoleCode.WAREHOUSE_STAFF} activeLabel="Tổng quan">
        <WarehouseOverviewPage />
      </RolePageShell>
    </AuthGuard>
  );
}
