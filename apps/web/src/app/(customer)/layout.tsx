import { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { CustomerSidebar } from "@/components/layout/customer-sidebar";

/** Khung man hinh Web chung cho tai khoan khach hang: sidebar + vung noi dung. */
export default function CustomerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <AuthGuard allowedRole={RoleCode.CUSTOMER}>
      <div className="flex min-h-screen flex-col bg-dt-bg lg:flex-row">
        <CustomerSidebar />
        <main className="flex min-w-0 flex-1 flex-col gap-[18px] px-4 pb-10 pt-6 sm:px-6 lg:px-9 lg:pt-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
