import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { DeliveryMobileShell } from "@/components/delivery/mobile-shell";
import { NotificationCenter } from "@/components/notifications/notification-center";

export default function DeliveryNotificationsPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.DELIVERY_STAFF}><DeliveryMobileShell active="notifications" subtitle="Thông báo"><NotificationCenter role={RoleCode.DELIVERY_STAFF} compact /></DeliveryMobileShell></AuthGuard>;
}
