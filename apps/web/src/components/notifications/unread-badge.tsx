"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

/** Lightweight unread count; failures stay silent so navigation still works. */
export function NotificationUnreadBadge({ dot = false }: { dot?: boolean }): React.JSX.Element | null {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      try {
        const result = await apiFetch<{ unreadCount: number }>("/api/notifications?filter=unread&page=1");
        if (mounted) setCount(result.unreadCount);
      } catch { /* AuthGuard handles invalid sessions; badge is optional. */ }
    }
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    window.addEventListener("notifications-changed", load);
    return () => { mounted = false; window.clearInterval(timer); window.removeEventListener("notifications-changed", load); };
  }, []);
  if (!count) return null;
  return dot
    ? <span aria-label={`${count} thông báo chưa đọc`} className="absolute right-1 top-1 h-2 w-2 rounded-full bg-dt-yellow" />
    : <span aria-label={`${count} thông báo chưa đọc`} className="ml-auto rounded-full bg-dt-yellow px-1.5 py-0.5 text-[10px] font-semibold text-dt-bg">{count > 99 ? "99+" : count}</span>;
}
