import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { DeliveryRoutesPage } from "@/components/delivery/delivery-routes";

export default function DeliveryRoutesDashboardPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.DELIVERY_STAFF}>
      <DeliveryRoutesPage />
    </AuthGuard>
  );
}
