import { RoleCode } from "@delivery/shared";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";

export default function AdminDashboardPage(): React.JSX.Element {
  return (
    <RoleDashboard
      roleCode={RoleCode.ADMIN}
      heading="Bảng điều khiển quản trị"
      subtitle="Quản lý người dùng, phân quyền và toàn bộ hệ thống."
      description="Tài khoản quản trị đã được xác minh. Các màn hình quản trị chi tiết sẽ được nối vào đây ở bước tiếp theo."
    />
  );
}
