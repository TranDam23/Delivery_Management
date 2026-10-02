import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { AlertsPage } from "@/components/alerts/alerts-page";

export default function AdminAlertsPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.ADMIN}><RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Cảnh báo"><AlertsPage orderBasePath="/dashboard/admin/orders" /></RolePageShell></AuthGuard>;
}
