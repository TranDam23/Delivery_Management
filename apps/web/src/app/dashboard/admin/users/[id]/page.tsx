import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AdminUserDetailPage } from "@/components/admin/admin-user-detail";
import { RolePageShell } from "@/components/dashboard/role-dashboard";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailRoute({ params }: PageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  return (
    <AuthGuard allowedRole={RoleCode.ADMIN}>
      <RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Người dùng">
        <AdminUserDetailPage userId={id} />
      </RolePageShell>
    </AuthGuard>
  );
}
