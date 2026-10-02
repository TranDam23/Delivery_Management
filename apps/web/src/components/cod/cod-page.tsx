"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { COD_LABEL, type CodListItem, type CodState } from "@/lib/cod";
import { formatDateTime, formatVnd } from "@/lib/order-ui";

interface CodPageResult { items: CodListItem[]; total: number; page: number; pageSize: number }
type Filter = "all" | CodState;

export function CodPage({ canReconcile = false, canOpenOrder = !canReconcile }: { canReconcile?: boolean; canOpenOrder?: boolean }): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const [result, setResult] = useState<CodPageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await apiFetch<CodPageResult>(`/api/cod?page=${page}`));
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không tải được COD"); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  const items = useMemo(() => filter === "all" ? result?.items ?? [] : (result?.items ?? []).filter((item) => item.codStatus === filter), [result, filter]);
  const pageTotal = items.reduce((sum, item) => sum + item.amount, 0);

  async function reconcile(item: CodListItem) {
    if (!window.confirm(`Xác nhận đã đối chiếu ${formatVnd(item.amount)} COD của đơn ${item.trackingCode}? Thao tác này KHÔNG ghi nhận đã chuyển tiền cho người gửi.`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      await apiFetch("/api/cod", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: item.id }) });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Đối soát thất bại"); }
    finally { setBusyId(null); }
  }

  return <div className="space-y-5 text-dt-text">
    <div><h1 className="text-2xl font-bold">COD & đối soát</h1><p className="mt-2 text-sm text-dt-muted">Theo dõi tiền thu hộ theo từng đơn. Phí vận chuyển được hạch toán riêng; đối soát không đồng nghĩa đã chuyển trả.</p></div>
    <div className="rounded-dt border border-dt-border bg-dt-panel p-4 text-sm">
      <p className="font-medium">Quy trình thu hộ</p>
      <p className="mt-2 text-dt-muted">Chưa thu → Shipper xác nhận thu và gửi ảnh giao hàng → Điều phối/Quản trị đối soát → Chuyển trả người gửi ngoài hệ thống.</p>
      <p className="mt-2 text-amber-300">Hệ thống hiện chưa tích hợp chuyển khoản hoặc xác nhận thanh toán; không dùng trạng thái đối soát làm bằng chứng đã nhận tiền.</p>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Lọc trạng thái COD">
      {(["all", "pending", "collected", "reconciled"] as Filter[]).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-md border px-3 py-2 text-xs ${filter === value ? "border-dt-yellow text-dt-yellow" : "border-dt-border text-dt-muted"}`}>{value === "all" ? "Tất cả" : COD_LABEL[value]}</button>)}
    </div>
    <p className="text-sm text-dt-muted">Tổng COD các đơn đang hiển thị trên trang này: <span className="font-semibold text-dt-text">{formatVnd(pageTotal)}</span></p>
    {error ? <p role="alert" className="text-sm text-dt-red">{error}</p> : null}
    <div className="overflow-x-auto rounded-dt border border-dt-border bg-dt-panel">
      <table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-dt-border text-dt-muted"><tr><th className="p-3">Mã đơn</th><th className="p-3">Người gửi</th><th className="p-3">COD phải thu</th><th className="p-3">Trạng thái</th><th className="p-3">Thời gian thu</th><th className="p-3">Đối soát</th><th className="p-3">Thao tác</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id} className="border-b border-dt-border/60 last:border-0"><td className="p-3">{canOpenOrder ? <Link className="text-dt-yellow hover:underline" href={`/orders/${item.id}`}>{item.trackingCode}</Link> : <span className="text-dt-yellow">{item.trackingCode}</span>}</td><td className="p-3">{item.senderName}</td><td className="p-3 font-semibold">{formatVnd(item.amount)}</td><td className="p-3">{item.codStatus === "pending" && item.orderStatus === "DELIVERED" ? <span className="text-dt-red">Đã giao nhưng thiếu bản ghi thu COD — cần kiểm tra</span> : COD_LABEL[item.codStatus]}</td><td className="p-3">{item.collectedAt ? formatDateTime(item.collectedAt) : "—"}</td><td className="p-3">{item.reconciledAt ? formatDateTime(item.reconciledAt) : "—"}</td><td className="p-3">{canReconcile && item.codStatus === "collected" ? <button type="button" disabled={busyId === item.id} onClick={() => void reconcile(item)} className="rounded-md border border-dt-yellow px-3 py-2 text-dt-yellow disabled:opacity-50">{busyId === item.id ? "Đang lưu..." : "Xác nhận đối soát"}</button> : "—"}</td></tr>)}
        {!loading && !items.length ? <tr><td colSpan={7} className="p-5 text-center text-dt-muted">Không có đơn COD trong trang này.</td></tr> : null}
      </tbody></table>
    </div>
    {loading ? <p className="text-sm text-dt-muted">Đang tải...</p> : null}
    <div className="flex items-center justify-between text-xs text-dt-muted"><span>Trang {page} / {Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 20)))} · {result?.total ?? 0} đơn COD</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border border-dt-border px-3 py-2 disabled:opacity-40">Trước</button><button type="button" disabled={loading || page * (result?.pageSize ?? 20) >= (result?.total ?? 0)} onClick={() => setPage((value) => value + 1)} className="rounded border border-dt-border px-3 py-2 disabled:opacity-40">Tiếp</button></div></div>
    <p className="text-xs text-dt-muted">Bộ lọc áp dụng cho trang hiện tại. Chuyển trang để xem thêm đơn cùng trạng thái.</p>
  </div>;
}
