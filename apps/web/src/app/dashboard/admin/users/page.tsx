import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { UserWarehouseAssignmentPage } from "@/components/admin/user-warehouse-assignment";

export default function AdminUsersPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.ADMIN}>
      <RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Người dùng">
        <UserWarehouseAssignmentPage />
      </RolePageShell>
    </AuthGuard>
  );
}
