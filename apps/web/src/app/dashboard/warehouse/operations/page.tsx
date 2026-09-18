import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { WarehouseOperationsPage } from "@/components/warehouse/warehouse-operations";

export default function WarehouseOperationsRoutePage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.WAREHOUSE_STAFF}>
      <RolePageShell roleCode={RoleCode.WAREHOUSE_STAFF} activeLabel="Vận hành kho">
        <WarehouseOperationsPage />
      </RolePageShell>
    </AuthGuard>
  );
}
