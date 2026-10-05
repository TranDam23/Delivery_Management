"use client";

import type { RoleCode } from "@delivery/shared";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useAuthSession } from "@/components/auth/auth-session-provider";
import { getToken, subscribeAuthToken } from "@/lib/api-client";
import { roleHomePath } from "@/lib/role-routing";

interface AuthGuardProps {
  children: React.ReactNode;
  /** Neu co truyen, chi cho phep dung mot vai tro tren trang hien tai. */
  allowedRole?: RoleCode;
  /** Cho phep nhieu vai tro dung chung mot man hinh. */
  allowedRoles?: readonly RoleCode[];
}

/** Page guards share the root session; only the first visit waits for /api/auth/me. */
export function AuthGuard({ children, allowedRole, allowedRoles }: AuthGuardProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { session, retry } = useAuthSession();
  const token = useSyncExternalStore(subscribeAuthToken, getToken, () => null);
  const user = token && session.token === token ? session.user : null;
  const roleNotAllowed = user
    ? allowedRole
      ? user.roleCode !== allowedRole
      : allowedRoles
        ? !allowedRoles.includes(user.roleCode)
        : false
    : false;

  useEffect(() => {
    if (!token) {
      // The hydration snapshot is null even when a browser token exists.
      if (!getToken()) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (user && roleNotAllowed) {
      router.replace(roleHomePath(user.roleCode));
    }
  }, [pathname, roleNotAllowed, router, token, user]);

  if (!token || roleNotAllowed) return <></>;
  if (!user) {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-dt-bg px-6 text-sm text-dt-muted">
      {session.error ? <>
        <p>Chưa thể kiểm tra phiên đăng nhập. Vui lòng thử lại.</p>
        <button type="button" onClick={retry} className="rounded-md border border-dt-border px-4 py-2 text-dt-text">Thử lại</button>
      </> : "Đang xác minh phiên đăng nhập..."}
    </main>;
  }

  return <>{children}</>;
}
