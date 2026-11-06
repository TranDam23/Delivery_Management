import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RegionManagementPage } from "@/components/dispatch/region-management";
import { RolePageShell } from "@/components/dashboard/role-dashboard";

export default function DispatcherRegionsPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.DISPATCHER}>
      <RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Khu vực">
        <RegionManagementPage />
      </RolePageShell>
    </AuthGuard>
  );
}
