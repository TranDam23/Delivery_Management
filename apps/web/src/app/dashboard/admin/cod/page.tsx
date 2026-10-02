import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { CodPage } from "@/components/cod/cod-page";

export default function AdminCodPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.ADMIN}><RolePageShell roleCode={RoleCode.ADMIN} activeLabel="COD & Đối soát"><CodPage canReconcile /></RolePageShell></AuthGuard>;
}
