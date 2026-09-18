import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ProfilePage } from "@/components/profile/profile-page";
import { RolePageShell } from "@/components/dashboard/role-dashboard";

export default function WarehouseAccountPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.WAREHOUSE_STAFF}>
      <RolePageShell roleCode={RoleCode.WAREHOUSE_STAFF} activeLabel="Tài khoản">
        <ProfilePage homeHref="/dashboard/warehouse" homeLabel="Về tổng quan kho" />
      </RolePageShell>
    </AuthGuard>
  );
}
