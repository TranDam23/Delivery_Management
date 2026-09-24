import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { NotificationCenter } from "@/components/notifications/notification-center";

export default function AdminNotificationsPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.ADMIN}><RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Thông báo"><NotificationCenter role={RoleCode.ADMIN} /></RolePageShell></AuthGuard>;
}
