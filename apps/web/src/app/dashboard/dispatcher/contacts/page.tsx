import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RolePageShell } from "@/components/dashboard/role-dashboard";
import { ContactBookPage } from "@/components/dispatch/contact-book";

export default function DispatcherContactsPage(): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.DISPATCHER}>
      <RolePageShell roleCode={RoleCode.DISPATCHER} activeLabel="Người gửi/nhận">
        <ContactBookPage />
      </RolePageShell>
    </AuthGuard>
  );
}
