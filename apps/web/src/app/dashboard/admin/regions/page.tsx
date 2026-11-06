import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RegionManagementPage } from "@/components/dispatch/region-management";
import { RolePageShell } from "@/components/dashboard/role-dashboard";

export default function AdminRegionsPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.ADMIN}>
      <RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Khu vực">
        <RegionManagementPage />
      </RolePageShell>
    </AuthGuard>
  );
}
