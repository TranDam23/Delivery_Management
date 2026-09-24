"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, CheckCheck, ChevronLeft, ChevronRight, PackageCheck, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { RoleCode } from "@delivery/shared";

interface Notice {
  id: string;
  order_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

interface NoticePage {
  items: Notice[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

function destination(role: RoleCode, notice: Notice): string | null {
  if (role === "CUSTOMER" && notice.order_id) return `/orders/${notice.order_id}`;
  if (role === "DELIVERY_STAFF") return "/dashboard/delivery/routes";
  if (role === "WAREHOUSE_STAFF") return "/dashboard/warehouse/operations";
  if (role === "DISPATCHER") return "/dashboard/dispatcher/warehouses";
  if (role === "ADMIN") return "/dashboard/admin/warehouses";
  return null;
}

export function NotificationCenter({ role, compact = false }: { role: RoleCode; compact?: boolean }): React.JSX.Element {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<NoticePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<NoticePage>(`/api/notifications?filter=${filter}&page=${page}`);
      setResult(response);
      window.dispatchEvent(new Event("notifications-changed"));
      if (page > 1 && response.items.length === 0) setPage(page - 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được thông báo");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function markRead(id: string): Promise<void> {
    const notice = result?.items.find((item) => item.id === id);
    if (!notice || notice.is_read) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/notifications/${id}`, { method: "PATCH" });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không đánh dấu được thông báo");
    } finally {
      setBusy(false);
    }
  }

  async function markAll(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/notifications", { method: "PATCH" });
      setPage(1);
      if (page === 1) await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không đánh dấu được thông báo");
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 10)));
  return (
    <div className={compact ? "space-y-4" : "mx-auto max-w-5xl px-5 py-8 md:px-8"}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-dt-yellow">Trung tâm thông báo</p>
          <h1 className="mt-1 text-2xl font-semibold text-dt-text">Thông báo</h1>
          <p className="mt-2 text-xs text-dt-muted">Cập nhật đơn hàng, nhiệm vụ và cảnh báo liên quan đến bạn.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Làm mới thông báo" onClick={() => void refresh()} className="rounded-md border border-dt-border bg-dt-panel p-2.5 text-dt-muted hover:text-dt-text"><RefreshCw size={16} /></button>
          <button type="button" disabled={busy || !result?.unreadCount} onClick={() => void markAll()} className="inline-flex items-center gap-2 rounded-md bg-dt-yellow px-3 py-2 text-xs font-medium text-dt-bg disabled:cursor-not-allowed disabled:opacity-50"><CheckCheck size={16} /> Đánh dấu tất cả đã đọc</button>
        </div>
      </header>

      <section className="mt-6 overflow-hidden rounded-dt border border-dt-border bg-dt-panel" aria-label="Danh sách thông báo">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dt-border px-4 py-4 md:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dt-muted">Mới nhất</p>
            <p className="mt-1 text-xs text-dt-muted">{result?.unreadCount ?? 0} thông báo chưa đọc</p>
          </div>
          <div className="flex rounded-md border border-dt-border bg-dt-panel2 p-1 text-xs">
            {(["all", "unread"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setResult(null); setFilter(value); setPage(1); }} className={`rounded px-3 py-1.5 ${filter === value ? "bg-dt-yellow text-dt-bg" : "text-dt-muted hover:text-dt-text"}`}>{value === "all" ? "Tất cả" : "Chưa đọc"}</button>
            ))}
          </div>
        </div>
        {error && <p role="alert" className="border-b border-dt-border px-4 py-3 text-xs text-red-300">{error}</p>}
        {loading && !result ? <p className="px-6 py-10 text-sm text-dt-muted">Đang tải thông báo...</p> : null}
        {!loading && result?.items.length === 0 ? <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-dt-muted"><Bell size={25} /><p className="text-sm">{filter === "unread" ? "Bạn đã đọc hết thông báo." : "Chưa có thông báo nào."}</p></div> : null}
        {result?.items.map((notice) => {
          const href = destination(role, notice);
          const warning = notice.type === "delivery_abnormal" || notice.type === "delivery_delayed";
          const Icon = warning ? AlertTriangle : notice.type === "delivery_success" ? PackageCheck : Bell;
          return <article key={notice.id} className={`flex gap-3 border-b border-dt-border px-4 py-4 last:border-b-0 md:px-6 ${notice.is_read ? "" : "bg-dt-yellow/[0.04]"}`}>
            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${warning ? "bg-red-400/10 text-red-300" : "bg-dt-yellow/10 text-dt-yellow"}`}><Icon size={17} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-dt-text">{notice.title}</p>
                {!notice.is_read && <span className="rounded-full bg-dt-yellow px-2 py-0.5 text-[10px] font-medium text-dt-bg">Mới</span>}
              </div>
              <p className="mt-1 text-xs leading-5 text-dt-muted">{notice.message}</p>
              <p className="mt-2 text-[11px] text-dt-muted">{new Date(notice.created_at).toLocaleString("vi-VN")}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {href && <Link href={href} onClick={() => { void markRead(notice.id); }} className="font-medium text-dt-yellow hover:underline">{role === "CUSTOMER" ? "Xem đơn hàng" : "Đến trang xử lý"}</Link>}
                {!notice.is_read && <button type="button" disabled={busy} onClick={() => void markRead(notice.id)} className="text-dt-muted hover:text-dt-text disabled:opacity-50">Đánh dấu đã đọc</button>}
              </div>
            </div>
          </article>;
        })}
        {result && result.total > result.pageSize && <div className="flex items-center justify-between gap-3 border-t border-dt-border px-4 py-3 text-xs text-dt-muted md:px-6">
          <span>Trang {page}/{totalPages} · {result.total} thông báo</span>
          <div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => { setResult(null); setPage(page - 1); }} className="rounded border border-dt-border p-2 disabled:opacity-40" aria-label="Trang trước"><ChevronLeft size={16} /></button><button type="button" disabled={page >= totalPages} onClick={() => { setResult(null); setPage(page + 1); }} className="rounded border border-dt-border p-2 disabled:opacity-40" aria-label="Trang sau"><ChevronRight size={16} /></button></div>
        </div>}
      </section>
    </div>
  );
}
