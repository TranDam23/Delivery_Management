import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { StaffOrdersPage } from "@/components/orders/staff-orders-page";

export default function AdminOrdersPage(): React.JSX.Element {
  return <AuthGuard allowedRole={RoleCode.ADMIN}><RolePageShell roleCode={RoleCode.ADMIN} activeLabel="Đơn hàng"><StaffOrdersPage basePath="/dashboard/admin/orders" heading="Quản lý đơn hàng" subtitle="Xem và theo dõi các đơn thuộc toàn hệ thống." /></RolePageShell></AuthGuard>;
}
