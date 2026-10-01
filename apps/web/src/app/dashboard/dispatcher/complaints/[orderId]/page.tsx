import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { FeedbackReview } from "@/components/orders/feedback-review";

export default async function DispatcherComplaintPage({ params }: { params: Promise<{ orderId: string }> }): Promise<React.JSX.Element> {
  const { orderId } = await params;
  return <AuthGuard allowedRole={RoleCode.DISPATCHER}><RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Thông báo"><FeedbackReview orderId={orderId} /></RolePageShell></AuthGuard>;
}
