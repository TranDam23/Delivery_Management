"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/order-ui";

interface AlertItem {
  id: string;
  order_id: string | null;
  alert_type: string;
  title: string;
  message: string;
  detected_at: string;
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  orders: { tracking_code: string } | { tracking_code: string }[] | null;
}
interface AlertsResult { items: AlertItem[]; total: number; page: number; pageSize: number }

const TYPE_LABEL: Record<string, string> = {
  DELIVERY_LATE: "Đơn trễ hạn",
  STUCK_STATUS: "Kẹt trạng thái",
  INVALID_STATUS_FLOW: "Luồng trạng thái bất thường",
  PACKAGE_DAMAGED: "Hàng hư hỏng",
  CUSTOMER_COMPLAINT: "Khiếu nại",
};
const STATUS_LABEL: Record<string, string> = { open: "Đang mở", acknowledged: "Đã tiếp nhận", resolved: "Đã xử lý", dismissed: "Bỏ qua" };
const FILTERS = [["open", "Đang mở"], ["acknowledged", "Đã tiếp nhận"], ["resolved", "Đã xử lý"], ["all", "Tất cả"]] as const;

/** Danh sách cảnh báo vận hành: đơn trễ, trạng thái bất thường, hàng hư hỏng, khiếu nại. */
export function AlertsPage({ orderBasePath }: { orderBasePath: string }): React.JSX.Element {
  const [filter, setFilter] = useState<string>("open");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AlertsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await apiFetch<AlertsResult>(`/api/alerts?status=${filter}&page=${page}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được cảnh báo");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);
  useEffect(() => { void load(); }, [load]);

  async function update(id: string, status: "acknowledged" | "resolved" | "dismissed"): Promise<void> {
    setBusyId(id);
    try {
      await apiFetch(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không cập nhật được cảnh báo");
    } finally {
      setBusyId(null);
    }
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  return <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-8 md:py-8">
    <PageHeader heading="Cảnh báo vận hành" subtitle="Đơn trễ hạn, bị giữ quá lâu hoặc có trạng thái bất thường, tự động phát hiện." action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : undefined} /> Làm mới</Button>} />
    <div className="mt-4 flex flex-wrap gap-2">
      {FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => { setFilter(value); setPage(1); }} className={`rounded-full px-3 py-1.5 text-[11px] ${filter === value ? "bg-dt-yellow text-dt-bg" : "bg-dt-panel2 text-dt-muted hover:text-dt-text"}`}>{label}</button>)}
    </div>
    {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
    <Card className="mt-4">
      {loading && !result ? <p className="text-[12px] text-dt-muted">Đang tải…</p> : null}
      {result && result.items.length === 0 ? <p className="text-[12px] text-dt-muted">Không có cảnh báo nào.</p> : null}
      <ul className="space-y-3">
        {result?.items.map((alert) => {
          const order = Array.isArray(alert.orders) ? alert.orders[0] : alert.orders;
          return <li key={alert.id} className="rounded-md border border-dt-border p-3 text-[12px]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{alert.title} <span className="ml-2 rounded-full bg-dt-yellow/10 px-2 py-0.5 text-[10px] text-dt-yellow">{TYPE_LABEL[alert.alert_type] ?? alert.alert_type}</span></p>
                <p className="mt-1 text-dt-muted">{alert.message}</p>
                <p className="mt-1 text-[10px] text-dt-muted">{formatDateTime(alert.detected_at)} · {STATUS_LABEL[alert.status]}{alert.order_id && order ? <> · <Link href={`${orderBasePath}/${alert.order_id}`} className="text-dt-yellow hover:underline">{order.tracking_code}</Link></> : null}</p>
              </div>
              {alert.status === "open" || alert.status === "acknowledged" ? <div className="flex gap-2">
                {alert.status === "open" ? <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={busyId === alert.id} onClick={() => void update(alert.id, "acknowledged")}>Tiếp nhận</Button> : null}
                <Button className="px-3 py-2 text-[11px]" disabled={busyId === alert.id} onClick={() => void update(alert.id, "resolved")}>Đã xử lý</Button>
                <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={busyId === alert.id} onClick={() => void update(alert.id, "dismissed")}>Bỏ qua</Button>
              </div> : null}
            </div>
          </li>;
        })}
      </ul>
      {result && pages > 1 ? <div className="mt-4 flex items-center justify-end gap-3 text-[11px] text-dt-muted">
        <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</Button>
        <span>Trang {page}/{pages}</span>
        <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sau</Button>
      </div> : null}
    </Card>
  </div>;
}
