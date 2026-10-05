"use client";

import { useEffect, useState } from "react";
import { apiFetch, getToken } from "@/lib/api-client";

const UNREAD_CACHE_MS = 30_000;
let unreadCache: { token: string; count: number; loadedAt: number } | null = null;
let unreadRequest: { token: string; version: number; promise: Promise<number> } | null = null;
let unreadVersion = 0;
let lastChangedEvent: Event | null = null;

function invalidateUnreadCount(event: Event): void {
  if (lastChangedEvent === event) return;
  lastChangedEvent = event;
  unreadVersion += 1;
  unreadCache = null;
  unreadRequest = null;
}

function loadUnreadCount(): Promise<number> {
  const token = getToken();
  if (!token) return Promise.resolve(0);
  if (unreadCache?.token === token && Date.now() - unreadCache.loadedAt < UNREAD_CACHE_MS) {
    return Promise.resolve(unreadCache.count);
  }
  const version = unreadVersion;
  if (unreadRequest?.token === token && unreadRequest.version === version) return unreadRequest.promise;
  const promise = apiFetch<{ unreadCount: number }>("/api/notifications?countOnly=1")
    .then(({ unreadCount }) => {
      if (getToken() === token && unreadVersion === version) unreadCache = { token, count: unreadCount, loadedAt: Date.now() };
      return unreadCount;
    })
    .finally(() => { if (unreadRequest?.promise === promise) unreadRequest = null; });
  unreadRequest = { token, version, promise };
  return promise;
}

/** Lightweight unread count; failures stay silent so navigation still works. */
export function NotificationUnreadBadge({ dot = false }: { dot?: boolean }): React.JSX.Element | null {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      const version = unreadVersion;
      const token = getToken();
      try {
        const nextCount = await loadUnreadCount();
        if (mounted && unreadVersion === version && getToken() === token) setCount(nextCount);
      } catch { /* AuthGuard handles invalid sessions; badge is optional. */ }
    }
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    const onChanged = (event: Event) => { invalidateUnreadCount(event); void load(); };
    window.addEventListener("notifications-changed", onChanged);
    return () => { mounted = false; window.clearInterval(timer); window.removeEventListener("notifications-changed", onChanged); };
  }, []);
  if (!count) return null;
  return dot
    ? <span aria-label={`${count} thông báo chưa đọc`} className="absolute right-1 top-1 h-2 w-2 rounded-full bg-dt-yellow" />
    : <span aria-label={`${count} thông báo chưa đọc`} className="ml-auto rounded-full bg-dt-yellow px-1.5 py-0.5 text-[10px] font-semibold text-dt-bg">{count > 99 ? "99+" : count}</span>;
}
