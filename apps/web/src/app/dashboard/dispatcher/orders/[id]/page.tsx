import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { OrderDetailPage } from "@/components/orders/order-detail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DispatcherOrderDetailRoute({ params }: PageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  return <AuthGuard allowedRole={RoleCode.DISPATCHER}><RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Đơn hàng"><div className="flex flex-col gap-[18px] px-5 py-6 md:px-8 md:py-8"><OrderDetailPage orderId={id} backHref="/dashboard/dispatcher/orders" /></div></RolePageShell></AuthGuard>;
}
