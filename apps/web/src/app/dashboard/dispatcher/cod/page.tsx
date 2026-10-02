import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { CodPage } from "@/components/cod/cod-page";

export default function DispatcherCodPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.DISPATCHER}><RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="COD & Đối soát"><CodPage canReconcile /></RolePageShell></AuthGuard>;
}
