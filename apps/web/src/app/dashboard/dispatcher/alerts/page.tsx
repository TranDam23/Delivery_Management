import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { AlertsPage } from "@/components/alerts/alerts-page";

export default function DispatcherAlertsPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.DISPATCHER}><RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Cảnh báo"><AlertsPage orderBasePath="/dashboard/dispatcher/orders" /></RolePageShell></AuthGuard>;
}
