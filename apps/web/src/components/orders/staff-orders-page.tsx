"use client";

import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { OrderStatusCode, type Paginated } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { addressText, formatDateTime, formatVnd, relationValue, statusClass, statusLabel, type OrderListItem } from "@/lib/order-ui";

const STATUS_OPTIONS = Object.values(OrderStatusCode);

/** Danh sách toàn bộ đơn trong phạm vi quản trị (Admin: toàn hệ thống; điều phối viên: kho/tỉnh phụ trách). */
export function StaffOrdersPage({ basePath, heading, subtitle }: { basePath: string; heading: string; subtitle: string }): React.JSX.Element {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) query.set("status", status);
    if (search.trim()) query.set("q", search.trim());
    try {
      const result = await apiFetch<Paginated<OrderListItem>>(`/api/orders?${query.toString()}`);
      setOrders(result.items);
      setTotal(result.total);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được danh sách đơn hàng");
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-8 md:py-8">
    <PageHeader heading={heading} subtitle={subtitle} action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : undefined} /> Làm mới</Button>} />
    <Card className="mt-5">
      <div className="grid gap-3 md:grid-cols-3">
        <TextField label="Tìm theo mã vận đơn" value={search} placeholder="Ví dụ: DT2610" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <SelectField label="Trạng thái" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Tất cả</option>
          {STATUS_OPTIONS.map((code) => <option key={code} value={code}>{statusLabel({ code, name: code })}</option>)}
        </SelectField>
      </div>
    </Card>
    {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
    <Card className="mt-4">
      <p className="mb-3 text-[11px] text-dt-muted">{total} đơn</p>
      {!loading && orders.length === 0 ? <p className="text-[12px] text-dt-muted">Không có đơn phù hợp.</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[11px]">
          <thead className="border-b border-dt-border text-[10px] uppercase tracking-wide text-dt-muted">
            <tr><th className="py-2 font-medium">Mã vận đơn</th><th className="py-2 font-medium">Người gửi → Người nhận</th><th className="py-2 font-medium">Nơi nhận</th><th className="py-2 font-medium">Trạng thái</th><th className="py-2 text-right font-medium">Phí</th><th className="py-2" /></tr>
          </thead>
          <tbody>
            {orders.map((order) => <tr key={order.id} className="border-b border-dt-border/70 align-top last:border-0">
              <td className="py-3"><Link href={`${basePath}/${order.id}`} className="font-medium text-dt-yellow hover:underline">{order.tracking_code}</Link><p className="mt-1 text-[10px] text-dt-muted">{formatDateTime(order.created_at)}</p></td>
              <td className="py-3">{relationValue(order.sender)?.name ?? "—"} → {relationValue(order.receiver)?.name ?? "—"}</td>
              <td className="max-w-[260px] py-3 text-dt-muted">{addressText(relationValue(order.delivery_address))}</td>
              <td className="py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${statusClass(order.order_statuses)}`}>{statusLabel(order.order_statuses)}</span></td>
              <td className="py-3 text-right text-dt-muted">{formatVnd(Number(order.total_fee) || 0)}</td>
              <td className="py-3 text-right"><Link href={`${basePath}/${order.id}`} aria-label={`Xem ${order.tracking_code}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dt-border text-dt-muted hover:text-dt-yellow"><ArrowUpRight size={14} /></Link></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {pages > 1 ? <div className="mt-4 flex items-center justify-end gap-3 text-[11px] text-dt-muted">
        <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</Button>
        <span>Trang {page}/{pages}</span>
        <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sau</Button>
      </div> : null}
    </Card>
  </div>;
}
