import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { HandoverPage } from "@/components/cod/handover-page";

export default function DispatcherHandoversPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.DISPATCHER}><RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Phiếu nộp tiền"><div className="px-5 py-6 md:px-8 md:py-8"><HandoverPage mode="staff" /></div></RolePageShell></AuthGuard>;
}
