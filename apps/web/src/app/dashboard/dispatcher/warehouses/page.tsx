import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { WarehouseManagementPage } from "@/components/dispatch/warehouse-management";

export default function DispatcherWarehousesPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.DISPATCHER}>
      <RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Kho & tuyến">
        <WarehouseManagementPage />
      </RolePageShell>
    </AuthGuard>
  );
}
