import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ProfilePage } from "@/components/profile/profile-page";
import { RolePageShell } from "@/components/dashboard/role-dashboard";

export default function AdminAccountPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.ADMIN}>
      <RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Hồ sơ cá nhân">
        <ProfilePage homeHref="/dashboard/admin" homeLabel="Về tổng quan" />
      </RolePageShell>
    </AuthGuard>
  );
}
