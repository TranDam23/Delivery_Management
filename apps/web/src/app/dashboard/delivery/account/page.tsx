import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { DeliveryMobileShell } from "@/components/delivery/mobile-shell";
import { ProfilePage } from "@/components/profile/profile-page";

export default function DeliveryAccountPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.DELIVERY_STAFF}>
      <DeliveryMobileShell active="account" subtitle="Hồ sơ cá nhân">
        <ProfilePage compact homeHref="/dashboard/delivery" homeLabel="Trang chủ" />
      </DeliveryMobileShell>
    </AuthGuard>
  );
}
