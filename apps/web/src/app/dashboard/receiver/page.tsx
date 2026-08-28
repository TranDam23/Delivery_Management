import { RoleCode } from "@delivery/shared";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";

export default function ReceiverDashboardPage(): React.JSX.Element {
  return (
    <RoleDashboard
      roleCode={RoleCode.RECEIVER}
      heading="Bảng điều khiển người nhận"
      subtitle="Theo dõi các đơn hàng đang chuyển đến bạn."
      description="Tài khoản người nhận đã được xác minh. Các màn hình theo dõi đơn hàng sẽ được nối vào đây ở bước tiếp theo."
    />
  );
}
