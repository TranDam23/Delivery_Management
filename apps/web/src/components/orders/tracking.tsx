"use client";

import { ArrowLeft, CheckCircle2, Search, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, relationValue, statusLabel, type TrackingResult } from "@/lib/order-ui";

export function TrackingSearchPage(): React.JSX.Element {
  const router = useRouter();
  const [trackingCode, setTrackingCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const code = trackingCode.trim().toUpperCase();
    if (!code) {
      setError("Vui lòng nhập mã vận đơn.");
      return;
    }
    setError(null);
    router.push(`/orders/track/${encodeURIComponent(code)}`);
  }

  return (
    <>
      <PageHeader heading="Theo dõi đơn hàng" subtitle="Nhập mã vận đơn để xem các mốc giao nhận đã được ghi nhận." action={<Link href="/customer" className={buttonClassName("secondary")}><ArrowLeft size={14} /> Về tổng quan</Link>} />
      <Card className="max-w-[760px]">
        <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-dt-yellow/10 text-dt-yellow"><Search size={17} /></span><div><CardLabel>Tra cứu hành trình</CardLabel><p className="mt-1 text-[12px] text-dt-muted">Mã có dạng DH + ngày tạo + mã định danh.</p></div></div>
        <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end"><TextField label="Mã vận đơn" required value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} placeholder="Ví dụ: DH20260915A1B2C3" wrapperClassName="flex-1" error={error ?? undefined} /><Button type="submit"><Search size={14} /> Tra cứu</Button></form>
      </Card>
    </>
  );
}

export function TrackingDetailPage({ trackingCode }: { trackingCode: string }): React.JSX.Element {
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTracking = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setResult(await apiFetch<TrackingResult>(`/api/orders/track/${encodeURIComponent(trackingCode)}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tìm thấy hành trình đơn hàng");
    } finally {
      setLoading(false);
    }
  }, [trackingCode]);

  useEffect(() => {
    void loadTracking();
  }, [loadTracking]);

  if (loading) return <Card><p className="text-[13px] text-dt-muted">Đang tra cứu hành trình...</p></Card>;
  if (error || !result) return <Card><p className="text-[13px] text-dt-red">{error ?? "Không có dữ liệu hành trình."}</p><Link href="/orders/track" className="text-[12px] text-dt-yellow hover:underline">Tra cứu mã khác</Link></Card>;

  const currentStatus = relationValue(result.order.order_statuses);

  return (
    <>
      <PageHeader heading={`Hành trình ${result.order.tracking_code}`} subtitle={`Tạo lúc ${formatDateTime(result.order.created_at)}`} action={<Link href="/orders/track" className={buttonClassName("secondary")}><ArrowLeft size={14} /> Tra cứu mã khác</Link>} />
      <section className="flex items-center justify-between gap-3 rounded-dt border border-dt-yellow/30 bg-dt-yellow/5 p-5"><div><p className="text-[10px] uppercase tracking-wide text-dt-muted">Trạng thái hiện tại</p><p className="mt-1 text-lg font-semibold">{statusLabel(result.order.order_statuses)}</p><p className="mt-1 text-[11px] text-dt-muted">Dịch vụ: {result.order.service_type}</p></div><Truck className="text-dt-yellow" size={25} /></section>
      <Card><div className="flex items-center gap-3"><Truck className="text-dt-yellow" size={18} /><div><CardLabel>Dòng thời gian</CardLabel><p className="mt-1 text-[11px] text-dt-muted">{result.events.length} mốc cập nhật</p></div></div><div className="mt-5 space-y-0">{result.events.length === 0 ? <p className="text-[12px] text-dt-muted">Chưa có mốc cập nhật ngoài trạng thái hiện tại.</p> : result.events.map((event, index) => <div key={`${event.event_time}-${index}`} className="flex gap-3"><div className="flex w-5 shrink-0 flex-col items-center"><span className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full ${index === result.events.length - 1 ? "bg-dt-yellow text-dt-bg" : "border border-dt-green/40 text-dt-green"}`}><CheckCircle2 size={12} /></span>{index < result.events.length - 1 ? <span className="h-full min-h-8 w-px bg-dt-border" /> : null}</div><div className="pb-5"><p className="text-[12px] font-medium">{statusLabel(event.order_statuses)}</p><p className="mt-1 text-[10px] text-dt-muted">{formatDateTime(event.event_time)}{event.note ? ` · ${event.note}` : ""}</p></div></div>)}</div></Card>
      <Card><div className="flex items-center gap-3"><Truck className="text-sky-300" size={18} /><div><CardLabel>Mốc nhập/xuất kho</CardLabel><p className="mt-1 text-[11px] text-dt-muted">Các điểm tập kết đã ghi nhận trên tuyến</p></div></div>{result.warehouseEvents.length === 0 ? <p className="mt-4 rounded-md bg-dt-panel2 p-3 text-[11px] text-dt-muted">Chưa có mốc nhập hoặc xuất kho.</p> : <div className="mt-4 space-y-2">{result.warehouseEvents.map((event, index) => <div key={`${event.event_time}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dt-border bg-dt-panel2 p-3"><div><p className="text-[12px] font-medium">{event.event_type === "INBOUND" ? "Nhập kho" : "Xuất kho"}{event.leg ? ` · Chặng ${event.leg.sequence_no}` : ""}</p><p className="mt-1 text-[10px] text-dt-muted">{event.warehouse ? `${event.warehouse.code} · ${event.warehouse.name} · ${event.warehouse.province}` : "Kho chưa xác định"}{event.note ? ` · ${event.note}` : ""}</p></div><span className="shrink-0 text-[10px] text-dt-muted">{formatDateTime(event.event_time)}</span></div>)}</div>}</Card>
      <Card><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 text-dt-green" size={18} /><div><CardLabel>Đối chiếu Blockchain</CardLabel><p className="mt-1 text-[11px] leading-5 text-dt-muted">Các sự kiện đã được hệ thống liên kết với blockchain sẽ xuất hiện ở đây.</p></div></div>{result.blockchainEvents.length === 0 ? <p className="mt-4 rounded-md bg-dt-panel2 p-3 text-[11px] text-dt-muted">Chưa có giao dịch blockchain được ghi cho mã này.</p> : <div className="mt-4 space-y-2">{result.blockchainEvents.map((event, index) => <div key={`${event.created_at}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dt-border bg-dt-panel2 p-3 text-[10px]"><span className="text-dt-text">{event.event_type}</span><span className="text-dt-muted">{event.transaction_hash ?? "Đang chờ xác nhận"}</span></div>)}</div>}{currentStatus ? <p className="mt-3 text-[10px] text-dt-muted">Mã trạng thái: {currentStatus.code}</p> : null}</Card>
    </>
  );
}
