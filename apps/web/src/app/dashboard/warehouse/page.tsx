import { RoleCode } from "@delivery/shared";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";

export default function WarehouseDashboardPage(): React.JSX.Element {
  return (
    <RoleDashboard
      roleCode={RoleCode.WAREHOUSE_STAFF}
      heading="Bảng điều khiển kho"
      subtitle="Theo dõi trạng thái hàng hóa trong kho."
      description="Các nghiệp vụ nhập kho, xuất kho và bàn giao sẽ được bổ sung trong các module tiếp theo."
    />
  );
}
