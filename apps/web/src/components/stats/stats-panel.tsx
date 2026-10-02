"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { formatVnd, statusLabel } from "@/lib/order-ui";

interface Bucket { key: string; created: number; delivered: number; failed: number; returned: number; late: number }
interface StatsResult {
  period: "day" | "month";
  totalOrders: number;
  inProgressOrders: number;
  deliveredOrders: number;
  failedOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  lateOrders: number;
  successRate: number;
  completionSuccessRate: number;
  truncated: boolean;
  byStatus: Record<string, number>;
  series: Bucket[];
  system?: { activeUsers?: number; openAlerts?: number; codAwaitingReconciliation?: number };
}

function isoDate(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "red" | "green" | "yellow" }): React.JSX.Element {
  const color = tone === "red" ? "text-red-300" : tone === "green" ? "text-dt-green" : tone === "yellow" ? "text-dt-yellow" : "text-dt-text";
  return <article className="rounded-dt border border-dt-border bg-dt-panel p-4">
    <p className="text-xs text-dt-muted">{label}</p>
    <p className={`mt-3 text-2xl font-semibold tracking-tight ${color}`}>{value}</p>
    {hint ? <p className="mt-1 text-[10px] text-dt-muted">{hint}</p> : null}
  </article>;
}

/** Thống kê đơn hàng theo vai trò, theo ngày hoặc theo tháng. */
export function StatsPanel({ heading = "Thống kê & báo cáo", subtitle = "Số liệu trong phạm vi đơn hàng bạn được xem." }: { heading?: string; subtitle?: string }): React.JSX.Element {
  const [period, setPeriod] = useState<"day" | "month">("day");
  const [from, setFrom] = useState(() => isoDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [data, setData] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<StatsResult>(`/api/stats?period=${period}&from=${from}&to=${to}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được thống kê");
    } finally {
      setLoading(false);
    }
  }, [period, from, to]);
  useEffect(() => { void load(); }, [load]);

  const max = Math.max(1, ...(data?.series ?? []).map((bucket) => bucket.created));

  return <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-8 md:py-8">
    <PageHeader heading={heading} subtitle={subtitle} action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : undefined} /> Làm mới</Button>} />
    <Card className="mt-5">
      <div className="grid gap-3 md:grid-cols-4">
        <SelectField label="Thống kê theo" value={period} onChange={(event) => {
          const next = event.target.value as "day" | "month";
          setPeriod(next);
          setFrom(isoDate(new Date(Date.now() - (next === "day" ? 29 : 365) * 24 * 60 * 60 * 1000)));
          setTo(isoDate(new Date()));
        }}>
          <option value="day">Ngày</option>
          <option value="month">Tháng</option>
        </SelectField>
        <TextField label="Từ ngày" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
        <TextField label="Đến ngày" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
      </div>
    </Card>
    {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
    {data ? <>
      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số tổng quan">
        <Metric label="Tổng số đơn" value={String(data.totalOrders)} hint={`${data.inProgressOrders} đang xử lý`} />
        <Metric label="Giao thành công" value={String(data.deliveredOrders)} tone="green" hint={`${data.successRate}% trên tổng đơn · ${data.completionSuccessRate}% trên đơn đã có kết quả`} />
        <Metric label="Thất bại / hoàn hàng" value={`${data.failedOrders} / ${data.returnedOrders}`} tone="yellow" hint={`${data.cancelledOrders} đơn đã hủy`} />
        <Metric label="Đơn trễ hạn" value={String(data.lateOrders)} tone={data.lateOrders > 0 ? "red" : undefined} hint="Quá thời gian giao dự kiến, chưa hoàn tất" />
        {data.system?.activeUsers !== undefined ? <Metric label="Tài khoản hoạt động" value={String(data.system.activeUsers)} /> : null}
        {data.system?.openAlerts !== undefined ? <Metric label="Cảnh báo đang mở" value={String(data.system.openAlerts)} tone={data.system.openAlerts > 0 ? "red" : undefined} /> : null}
        {data.system?.codAwaitingReconciliation !== undefined ? <Metric label="COD chờ đối soát" value={formatVnd(data.system.codAwaitingReconciliation)} tone="yellow" /> : null}
      </section>
      {data.truncated ? <p className="mt-3 text-[11px] text-dt-yellow">Số liệu bị giới hạn ở mức tối đa; hãy thu hẹp khoảng thời gian.</p> : null}

      <Card className="mt-5">
        <CardLabel>{period === "day" ? "Đơn theo ngày tạo" : "Đơn theo tháng tạo"}</CardLabel>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[11px]">
            <thead className="border-b border-dt-border text-[10px] uppercase tracking-wide text-dt-muted">
              <tr><th className="py-2 font-medium">{period === "day" ? "Ngày" : "Tháng"}</th><th className="py-2 font-medium">Đã tạo</th><th className="py-2 font-medium">Thành công</th><th className="py-2 font-medium">Thất bại</th><th className="py-2 font-medium">Hoàn</th><th className="py-2 font-medium">Trễ hạn</th><th className="w-1/3 py-2 font-medium" /></tr>
            </thead>
            <tbody>
              {data.series.map((bucket) => <tr key={bucket.key} className="border-b border-dt-border/70 last:border-0">
                <td className="py-2 text-dt-muted">{bucket.key}</td>
                <td className="py-2">{bucket.created}</td>
                <td className="py-2 text-dt-green">{bucket.delivered}</td>
                <td className="py-2">{bucket.failed}</td>
                <td className="py-2">{bucket.returned}</td>
                <td className={`py-2 ${bucket.late > 0 ? "text-red-300" : ""}`}>{bucket.late}</td>
                <td className="py-2"><div className="h-2 rounded bg-dt-panel2"><div className="h-2 rounded bg-dt-yellow" style={{ width: `${(bucket.created / max) * 100}%` }} /></div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-5">
        <CardLabel>Phân bố theo trạng thái</CardLabel>
        <ul className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(data.byStatus).sort((a, b) => b[1] - a[1]).map(([code, count]) => <li key={code} className="flex justify-between rounded-md bg-dt-panel2 px-3 py-2"><span className="text-dt-muted">{statusLabel({ code, name: code })}</span><span className="font-medium">{count}</span></li>)}
        </ul>
      </Card>
    </> : loading ? <p className="mt-5 text-[12px] text-dt-muted">Đang tải thống kê…</p> : null}
  </div>;
}
