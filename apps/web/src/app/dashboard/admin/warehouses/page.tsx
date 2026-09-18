import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { WarehouseManagementPage } from "@/components/dispatch/warehouse-management";
import { RolePageShell } from "@/components/dashboard/role-dashboard";

export default function AdminWarehousesPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.ADMIN}>
      <RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Kho & tuyến">
        <WarehouseManagementPage />
      </RolePageShell>
    </AuthGuard>
  );
}
