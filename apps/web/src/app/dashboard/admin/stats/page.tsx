import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { StatsPanel } from "@/components/stats/stats-panel";

export default function AdminStatsPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.ADMIN}><RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Thống kê"><StatsPanel heading="Dashboard hệ thống" subtitle="Chỉ số tổng quan toàn hệ thống theo ngày hoặc tháng." /></RolePageShell></AuthGuard>;
}
