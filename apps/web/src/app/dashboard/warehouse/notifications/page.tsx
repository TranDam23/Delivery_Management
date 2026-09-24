import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { NotificationCenter } from "@/components/notifications/notification-center";

export default function WarehouseNotificationsPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.WAREHOUSE_STAFF}><RolePageShell roleCode={RoleCode.WAREHOUSE_STAFF} activeLabel="Thông báo"><NotificationCenter role={RoleCode.WAREHOUSE_STAFF} /></RolePageShell></AuthGuard>;
}
