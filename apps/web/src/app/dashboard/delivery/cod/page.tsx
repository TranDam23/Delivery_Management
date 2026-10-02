import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { CodPage } from "@/components/cod/cod-page";
import { DeliveryMobileShell } from "@/components/delivery/mobile-shell";

export default function DeliveryCodPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.DELIVERY_STAFF}><DeliveryMobileShell active="cod" subtitle="COD đã phân công"><CodPage canOpenOrder={false} /></DeliveryMobileShell></AuthGuard>;
}
