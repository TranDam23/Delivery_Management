"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { clearAuth } from "@/lib/api-client";

export function LogoutButton(): React.JSX.Element {
  const router = useRouter();

  function handleLogout(): void {
    clearAuth();
    router.replace("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="flex w-full items-center gap-2 rounded-md px-[10px] py-2 text-left text-[11px] text-dt-muted transition hover:bg-dt-panel2 hover:text-dt-text"
    >
      <LogOut size={14} strokeWidth={1.8} />
      Đăng xuất
    </button>
  );
}
