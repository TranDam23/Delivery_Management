"use client";

import { useCallback, useEffect, useState } from "react";
import { HANDOVER_STATUS_LABEL, type HandoverItem, type HandoverSummary } from "@/lib/cash-handover";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, formatVnd } from "@/lib/order-ui";

interface HandoverResult { pending: HandoverItem[]; handovers: HandoverSummary[] }

const KIND_LABEL: Record<HandoverItem["kind"], string> = { cod: "COD", shipping_fee: "Phí vận chuyển" };
const STATUS_TONE: Record<HandoverSummary["status"], string> = {
  pending: "bg-dt-yellow/10 text-dt-yellow",
  confirmed: "bg-dt-green/10 text-dt-green",
  rejected: "bg-dt-red/10 text-red-300",
};
const FILTERS = [["pending", "Chờ xác nhận"], ["confirmed", "Đã nhận"], ["rejected", "Bị từ chối"], ["all", "Tất cả"]] as const;

function ItemList({ items }: { items: HandoverItem[] }): React.JSX.Element {
  return <ul className="mt-2 space-y-1 text-[11px] text-dt-muted">
    {items.map((item) => <li key={`${item.orderId}-${item.kind}`} className="flex justify-between gap-3"><span>{item.trackingCode} · {KIND_LABEL[item.kind]}</span><span>{formatVnd(item.amount)}</span></li>)}
  </ul>;
}

/**
 * Nộp tiền mặt về bưu cục. Shipper gộp COD và phí vận chuyển tiền mặt đã thu vào một phiếu;
 * nhân viên kho (hoặc điều phối/admin trong phạm vi) xác nhận đã nhận đủ hoặc từ chối.
 */
export function HandoverPage({ mode }: { mode: "shipper" | "staff" }): React.JSX.Element {
  const [filter, setFilter] = useState<string>("pending");
  const [result, setResult] = useState<HandoverResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await apiFetch<HandoverResult>(mode === "staff" ? `/api/cash-handovers?status=${filter}` : "/api/cash-handovers"));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được phiếu nộp tiền");
    } finally {
      setLoading(false);
    }
  }, [mode, filter]);
  useEffect(() => { void load(); }, [load]);

  async function submitHandover(): Promise<void> {
    if (!window.confirm("Lập phiếu nộp toàn bộ tiền mặt đã thu (COD và phí vận chuyển) về bưu cục? Bạn cần mang đúng số tiền này tới bưu cục.")) return;
    setBusyId("new");
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/cash-handovers", { method: "POST" });
      setNotice("Đã lập phiếu nộp tiền. Hãy nộp tiền tại bưu cục để nhân viên kho xác nhận.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không lập được phiếu nộp tiền");
    } finally {
      setBusyId(null);
    }
  }

  async function decide(handover: HandoverSummary, action: "confirm" | "reject"): Promise<void> {
    let note: string | undefined;
    if (action === "reject") {
      const reason = window.prompt("Lý do từ chối phiếu (ví dụ: nộp thiếu tiền):", "");
      if (!reason?.trim()) return;
      note = reason.trim();
    } else if (!window.confirm(`Xác nhận đã nhận đủ ${formatVnd(handover.codAmount + handover.feeAmount)} từ ${handover.shipperName}?`)) {
      return;
    }
    setBusyId(handover.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/cash-handovers/${handover.id}`, { method: "PATCH", body: JSON.stringify({ action, note }) });
      setNotice(action === "confirm" ? "Đã xác nhận nhận tiền." : "Đã từ chối phiếu; shipper sẽ lập phiếu lại.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không xử lý được phiếu");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCod = (result?.pending ?? []).filter((item) => item.kind === "cod").reduce((sum, item) => sum + item.amount, 0);
  const pendingFee = (result?.pending ?? []).filter((item) => item.kind === "shipping_fee").reduce((sum, item) => sum + item.amount, 0);

  return <div className="space-y-4 text-dt-text">
    <div>
      <h1 className="text-2xl font-bold">{mode === "shipper" ? "Nộp tiền về bưu cục" : "Phiếu nộp tiền của shipper"}</h1>
      <p className="mt-2 text-sm text-dt-muted">{mode === "shipper"
        ? "Gộp COD và phí vận chuyển tiền mặt đã thu vào một phiếu, nộp tại bưu cục. COD chỉ được đối soát sau khi bưu cục xác nhận đã nhận tiền."
        : "Xác nhận khi đã nhận đủ tiền từ shipper. Từ chối nếu thiếu hoặc sai số tiền, kèm lý do."}</p>
    </div>
    {error ? <p role="alert" className="rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
    {notice ? <p role="status" className="rounded-dt border border-dt-green/30 bg-dt-green/10 px-4 py-3 text-sm text-dt-green">{notice}</p> : null}

    {mode === "shipper" ? <section className="rounded-dt border border-dt-border bg-dt-panel p-4">
      <p className="font-medium">Tiền mặt đã thu, chưa nộp</p>
      {(result?.pending.length ?? 0) === 0 ? <p className="mt-2 text-sm text-dt-muted">{loading ? "Đang tải…" : "Không có khoản nào cần nộp."}</p> : <>
        <p className="mt-2 text-sm">COD <strong className="text-dt-yellow">{formatVnd(pendingCod)}</strong> + phí vận chuyển <strong className="text-dt-yellow">{formatVnd(pendingFee)}</strong> = <strong className="text-dt-yellow">{formatVnd(pendingCod + pendingFee)}</strong></p>
        <ItemList items={result?.pending ?? []} />
        <button type="button" disabled={busyId === "new"} onClick={() => void submitHandover()} className="mt-4 w-full rounded-dt bg-dt-yellow px-4 py-3 text-sm font-medium text-dt-bg disabled:opacity-50">Lập phiếu nộp {formatVnd(pendingCod + pendingFee)}</button>
      </>}
    </section> : <div className="flex flex-wrap gap-2">
      {FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs ${filter === value ? "bg-dt-yellow text-dt-bg" : "bg-dt-panel2 text-dt-muted hover:text-dt-text"}`}>{label}</button>)}
    </div>}

    <section className="space-y-3">
      <p className="font-medium">{mode === "shipper" ? "Lịch sử phiếu nộp" : "Danh sách phiếu"}</p>
      {!loading && (result?.handovers.length ?? 0) === 0 ? <p className="text-sm text-dt-muted">Chưa có phiếu nào.</p> : null}
      {result?.handovers.map((handover) => <article key={handover.id} className="rounded-dt border border-dt-border bg-dt-panel p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{formatVnd(handover.codAmount + handover.feeAmount)} <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${STATUS_TONE[handover.status]}`}>{HANDOVER_STATUS_LABEL[handover.status]}</span></p>
            <p className="mt-1 text-xs text-dt-muted">{handover.shipperName} → {handover.warehouseName} · {formatDateTime(handover.submittedAt)}</p>
            <p className="text-xs text-dt-muted">COD {formatVnd(handover.codAmount)} · Phí vận chuyển {formatVnd(handover.feeAmount)}</p>
            {handover.note ? <p className="mt-1 text-xs text-dt-muted">Ghi chú: {handover.note}</p> : null}
          </div>
          {mode === "staff" && handover.status === "pending" ? <div className="flex gap-2">
            <button type="button" disabled={busyId === handover.id} onClick={() => void decide(handover, "confirm")} className="rounded-md bg-dt-yellow px-3 py-2 text-xs font-medium text-dt-bg disabled:opacity-50">Đã nhận đủ</button>
            <button type="button" disabled={busyId === handover.id} onClick={() => void decide(handover, "reject")} className="rounded-md border border-dt-border px-3 py-2 text-xs text-dt-muted disabled:opacity-50">Từ chối</button>
          </div> : null}
        </div>
        <ItemList items={handover.items} />
      </article>)}
    </section>
  </div>;
}
