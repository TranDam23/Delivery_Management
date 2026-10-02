import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { PaymentAccountsManager } from "@/components/admin/payment-accounts";

export default function AdminPaymentAccountsPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.ADMIN}><RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Tài khoản nhận tiền"><PaymentAccountsManager /></RolePageShell></AuthGuard>;
}
