import { RoleCode } from "@delivery/shared";
import { NotificationCenter } from "@/components/notifications/notification-center";

export default function CustomerNotificationsPage(): React.JSX.Element {
  return <NotificationCenter role={RoleCode.CUSTOMER} />;
}
