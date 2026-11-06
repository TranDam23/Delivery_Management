import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { DispatcherOrderCreatePage } from "@/components/dispatch/dispatcher-order-create";

export default function DispatcherNewOrderPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.DISPATCHER}>
      <RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Tạo đơn hộ">
        <DispatcherOrderCreatePage ordersPath="/dashboard/dispatcher/orders" />
      </RolePageShell>
    </AuthGuard>
  );
}
