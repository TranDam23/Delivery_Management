import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { AuditLogsPage } from "@/components/admin/audit-logs";

export default function AdminAuditLogsPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.ADMIN}><RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Nhật ký thao tác"><AuditLogsPage /></RolePageShell></AuthGuard>;
}
