import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { PricingManagementPage } from "@/components/pricing/pricing-management";

export default function AdminPricingPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.ADMIN}>
      <RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Bảng giá">
        <PricingManagementPage />
      </RolePageShell>
    </AuthGuard>
  );
}
