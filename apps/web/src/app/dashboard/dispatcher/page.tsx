import { RoleCode } from "@delivery/shared";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";

export default function DispatcherDashboardPage(): React.JSX.Element {
  return (
    <RoleDashboard
      roleCode={RoleCode.DISPATCHER}
      heading="Bảng điều khiển điều phối"
      subtitle="Theo dõi và điều phối các đơn giao nhận."
      description="Ưu tiên các đơn chưa phân công, theo dõi tài xế đang hoạt động và xử lý cảnh báo giao nhận trong ca."
    />
  );
}
