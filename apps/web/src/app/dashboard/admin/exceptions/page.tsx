import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { ShipmentExceptionPage } from "@/components/dispatch/shipment-exception-management";

export default function AdminExceptionsPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.ADMIN}>
      <RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Ngoại lệ vận chuyển">
        <ShipmentExceptionPage />
      </RolePageShell>
    </AuthGuard>
  );
}
