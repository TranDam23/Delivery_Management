import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ProfilePage } from "@/components/profile/profile-page";
import { RolePageShell } from "@/components/dashboard/role-dashboard";

export default function DispatcherAccountPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.DISPATCHER}>
      <RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Tài khoản">
        <ProfilePage homeHref="/dashboard/dispatcher" homeLabel="Về tổng quan" />
      </RolePageShell>
    </AuthGuard>
  );
}
