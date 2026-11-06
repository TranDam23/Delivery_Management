import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { ShipmentExceptionPage } from "@/components/dispatch/shipment-exception-management";

export default function DispatcherExceptionsPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.DISPATCHER}>
      <RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Ngoại lệ vận chuyển">
        <ShipmentExceptionPage />
      </RolePageShell>
    </AuthGuard>
  );
}
