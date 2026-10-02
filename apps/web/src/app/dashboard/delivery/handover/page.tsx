import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { HandoverPage } from "@/components/cod/handover-page";
import { DeliveryMobileShell } from "@/components/delivery/mobile-shell";

export default function DeliveryHandoverPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.DELIVERY_STAFF}><DeliveryMobileShell active="handover" subtitle="Nộp tiền về bưu cục"><HandoverPage mode="shipper" /></DeliveryMobileShell></AuthGuard>;
}
