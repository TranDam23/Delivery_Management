import type { RoleCode } from "@delivery/shared";
import { AuthGuard } from "@/components/auth/auth-guard";
import { LogoutButton } from "@/components/auth/logout-button";
import { ROLE_LABEL } from "@/lib/role-routing";

interface RoleDashboardProps {
  roleCode: RoleCode;
  heading: string;
  subtitle: string;
  description: string;
}

/** Khung tam cho cac vai tro chua co module rieng; role van duoc guard day du. */
export function RoleDashboard({
  roleCode,
  heading,
  subtitle,
  description,
}: RoleDashboardProps): React.JSX.Element {
  return (
    <AuthGuard allowedRole={roleCode}>
      <main className="min-h-screen bg-dt-bg px-5 py-6 text-dt-text md:px-10 md:py-8">
        <div className="mx-auto max-w-5xl">
          <header className="flex items-start justify-between gap-5 border-b border-dt-border pb-6">
            <div>
              <p className="text-[21px] font-bold text-dt-yellow">DeliverTrust</p>
              <p className="mt-1 text-[10px] text-dt-muted">{ROLE_LABEL[roleCode]}</p>
            </div>
            <div className="w-[104px]">
              <LogoutButton />
            </div>
          </header>

          <section className="mt-8 rounded-dt border border-dt-border bg-dt-panel p-6 md:p-8">
            <p className="text-[10px] uppercase tracking-[0.12em] text-dt-yellow">{ROLE_LABEL[roleCode]}</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">{heading}</h1>
            <p className="mt-2 text-sm text-dt-muted">{subtitle}</p>
            <div className="mt-7 rounded-dt border border-dt-border bg-dt-panel2 p-5">
              <p className="text-sm leading-6 text-dt-text">{description}</p>
              <p className="mt-3 text-xs leading-5 text-dt-muted">
                Bạn có thể tiếp tục bổ sung các module của vai trò này theo lộ trình. API vẫn kiểm tra JWT và quyền ở phía máy chủ.
              </p>
            </div>
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}
