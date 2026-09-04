import { RoleCode } from "@delivery/shared";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";

export default function DeliveryDashboardPage(): React.JSX.Element {
  return (
    <RoleDashboard
      roleCode={RoleCode.DELIVERY_STAFF}
      heading="Bảng điều khiển giao nhận"
      subtitle="Cập nhật trạng thái và xác minh hành trình giao hàng."
      description="Kiểm tra đơn tiếp theo, tuyến đường, COD cần thu và hoàn tất từng mốc giao nhận trong ca."
    />
  );
}
