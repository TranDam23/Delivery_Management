import { RoleCode } from "@delivery/shared";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";

export default function DispatcherDashboardPage(): React.JSX.Element {
  return (
    <RoleDashboard
      roleCode={RoleCode.DISPATCHER}
      heading="Bảng điều khiển điều phối"
      subtitle="Theo dõi và điều phối các đơn giao nhận."
      description="Tài khoản điều phối đã được xác minh. Các module đơn hàng và phân công giao nhận sẽ được bổ sung tại đây."
    />
  );
}
