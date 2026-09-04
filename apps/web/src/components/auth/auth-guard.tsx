"use client";

import type { AuthenticatedUser, RoleCode } from "@delivery/shared";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, clearAuth, getToken } from "@/lib/api-client";
import { roleHomePath } from "@/lib/role-routing";

interface AuthGuardProps {
  children: React.ReactNode;
  /** Neu co truyen, chi cho phep dung mot vai tro tren trang hien tai. */
  allowedRole?: RoleCode;
}

/** Bao ve cac trang client bang JWT va dong bo lai role tu database. */
export function AuthGuard({ children, allowedRole }: AuthGuardProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function verifySession(): Promise<void> {
      if (!getToken()) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      try {
        const result = await apiFetch<{ user: AuthenticatedUser }>("/api/auth/me");
        if (!mounted) return;

        if (allowedRole && result.user.roleCode !== allowedRole) {
          router.replace(roleHomePath(result.user.roleCode));
          return;
        }

        setReady(true);
      } catch {
        if (!mounted) return;
        clearAuth();
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    }

    void verifySession();
    return () => {
      mounted = false;
    };
  }, [allowedRole, pathname, router]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-dt-bg px-6 text-sm text-dt-muted">
        Đang xác minh phiên đăng nhập...
      </main>
    );
  }

  return <>{children}</>;
}
