import { RoleCode } from "@delivery/shared";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";

export default function AdminDashboardPage(): React.JSX.Element {
  return (
    <RoleDashboard
      roleCode={RoleCode.ADMIN}
      heading="Bảng điều khiển quản trị"
      subtitle="Quản lý người dùng, phân quyền và toàn bộ hệ thống."
      description="Theo dõi sức khỏe vận hành, bảo mật dữ liệu và các chỉ số quan trọng của toàn bộ mạng lưới DeliverTrust."
    />
  );
}
