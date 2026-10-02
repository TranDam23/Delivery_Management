import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { StatsPanel } from "@/components/stats/stats-panel";

export default function DispatcherStatsPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.DISPATCHER}><RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Thống kê"><StatsPanel heading="Thống kê khu vực phụ trách" subtitle="Số liệu các đơn thuộc kho/tỉnh bạn phụ trách." /></RolePageShell></AuthGuard>;
}
