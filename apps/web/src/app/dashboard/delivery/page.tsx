import { RoleCode } from "@delivery/shared";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";

export default function DeliveryDashboardPage(): React.JSX.Element {
  return (
    <RoleDashboard
      roleCode={RoleCode.DELIVERY_STAFF}
      heading="Bảng điều khiển giao nhận"
      subtitle="Cập nhật trạng thái và xác minh hành trình giao hàng."
      description="Tài khoản nhân viên giao nhận đã được xác minh. Các thao tác cập nhật chuyến giao sẽ được triển khai ở bước tiếp theo."
    />
  );
}
