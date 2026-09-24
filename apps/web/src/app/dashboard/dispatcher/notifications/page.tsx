import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { NotificationCenter } from "@/components/notifications/notification-center";

export default function DispatcherNotificationsPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.DISPATCHER}><RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Thông báo"><NotificationCenter role={RoleCode.DISPATCHER} /></RolePageShell></AuthGuard>;
}
