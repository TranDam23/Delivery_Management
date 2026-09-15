"use client";

import { ArrowLeft, Box, CheckCircle2, Download, MapPin, QrCode, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  addressText,
  formatDateTime,
  formatVnd,
  relationValue,
  statusLabel,
  type OrderDetail,
  type OrderEvent,
} from "@/lib/order-ui";

interface OrderDetailResponse {
  order: OrderDetail;
  events: OrderEvent[];
}

interface QrResponse {
  trackingCode: string;
  qrDataUrl: string;
}

export function OrderDetailPage({ orderId }: { orderId: string }): React.JSX.Element {
  const [result, setResult] = useState<OrderDetailResponse | null>(null);
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingQr, setLoadingQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const loadOrder = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setResult(await apiFetch<OrderDetailResponse>(`/api/orders/${encodeURIComponent(orderId)}`));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) setError("Không tìm thấy đơn hàng.");
      else setError(caught instanceof Error ? caught.message : "Không tải được chi tiết đơn hàng");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  async function loadQr(): Promise<void> {
    if (qr) return;
    setLoadingQr(true);
    setQrError(null);
    try {
      setQr(await apiFetch<QrResponse>(`/api/orders/${encodeURIComponent(orderId)}/qr`));
    } catch (caught) {
      setQrError(caught instanceof Error ? caught.message : "Không tạo được mã QR");
    } finally {
      setLoadingQr(false);
    }
  }

  if (loading) {
    return <Card><p className="text-[13px] text-dt-muted">Đang tải chi tiết đơn hàng...</p></Card>;
  }
  if (error || !result) {
    return <Card><p className="text-[13px] text-dt-red">{error ?? "Không có dữ liệu đơn hàng."}</p><Link href="/customer" className="text-[12px] text-dt-yellow hover:underline">Về tổng quan</Link></Card>;
  }

  const { order, events } = result;
  const sender = relationValue(order.sender);
  const receiver = relationValue(order.receiver);
  const pickupAddress = relationValue(order.pickup_address);
  const deliveryAddress = relationValue(order.delivery_address);
  const timeline: OrderEvent[] = events.length > 0 ? events : [{ event_time: order.created_at, order_statuses: { code: "CREATED", name: "" }, note: "Đơn hàng được tạo" }];

  return (
    <>
      <PageHeader
        heading={`Đơn hàng ${order.tracking_code}`}
        subtitle={`Tạo lúc ${formatDateTime(order.created_at)}`}
        action={<Link href="/customer" className={buttonClassName("secondary")}><ArrowLeft size={14} /> Về tổng quan</Link>}
      />

      <section className="flex flex-col gap-4 rounded-dt border border-dt-yellow/30 bg-dt-yellow/5 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-dt-yellow text-dt-bg"><PackageIcon /></span><div><p className="text-[11px] uppercase tracking-wide text-dt-muted">Trạng thái hiện tại</p><p className="mt-1 text-lg font-semibold">{statusLabel(order.order_statuses)}</p><p className="mt-1 text-[11px] text-dt-muted">Dịch vụ: {order.service_type}</p></div></div>
        <div className="flex flex-wrap gap-2"><Link href={`/orders/track/${encodeURIComponent(order.tracking_code)}`} className={buttonClassName("secondary")}><Truck size={14} /> Xem hành trình</Link><Button onClick={() => void loadQr()} disabled={loadingQr}><QrCode size={14} />{loadingQr ? "Đang tạo QR..." : "Hiện QR"}</Button></div>
      </section>

      {qrError ? <p className="rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[12px] text-red-200">{qrError}</p> : null}
      {qr ? <Card className="items-center"><CardLabel>QR vận đơn</CardLabel><Image src={qr.qrDataUrl} alt={`QR của ${qr.trackingCode}`} width={208} height={208} unoptimized className="h-52 w-52 rounded-md bg-white p-2" /><a href={qr.qrDataUrl} download={`${qr.trackingCode}.png`} className="inline-flex items-center gap-2 text-[11px] text-dt-yellow hover:underline"><Download size={13} /> Tải QR xuống</a></Card> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardLabel>Người gửi</CardLabel><p className="text-sm font-semibold">{sender?.name ?? "—"}</p><p className="text-[12px] text-dt-muted">{sender?.phone ?? "—"}</p><div className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-dt-muted"><MapPin size={14} className="mt-0.5 shrink-0 text-dt-yellow" />{addressText(pickupAddress)}</div></Card>
        <Card><CardLabel>Người nhận</CardLabel><p className="text-sm font-semibold">{receiver?.name ?? "—"}</p><p className="text-[12px] text-dt-muted">{receiver?.phone ?? "—"}</p><div className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-dt-muted"><MapPin size={14} className="mt-0.5 shrink-0 text-sky-300" />{addressText(deliveryAddress)}</div></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <Card><div className="flex items-center justify-between gap-3"><div><CardLabel>Hàng hóa</CardLabel><p className="mt-1 text-[11px] text-dt-muted">{order.order_items.length} mặt hàng</p></div><Box className="text-dt-yellow" size={18} /></div><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[11px]"><thead className="border-b border-dt-border text-[10px] uppercase tracking-wide text-dt-muted"><tr><th className="py-2 font-medium">Tên hàng</th><th className="py-2 font-medium">Loại</th><th className="py-2 text-right font-medium">SL</th><th className="py-2 text-right font-medium">Khối lượng</th><th className="py-2 text-right font-medium">Khai giá</th></tr></thead><tbody>{order.order_items.map((item) => <tr key={item.id} className="border-b border-dt-border/70 last:border-0"><td className="py-3">{item.item_name}</td><td className="py-3 text-dt-muted">{item.item_type ?? "—"}</td><td className="py-3 text-right">{item.quantity}</td><td className="py-3 text-right text-dt-muted">{item.weight ? `${item.weight} kg` : "—"}</td><td className="py-3 text-right text-dt-muted">{item.declared_value ? formatVnd(Number(item.declared_value)) : "—"}</td></tr>)}</tbody></table></div>{order.note ? <p className="mt-4 rounded-md bg-dt-panel2 p-3 text-[11px] leading-5 text-dt-muted"><strong className="text-dt-text">Ghi chú:</strong> {order.note}</p> : null}</Card>
        <Card><CardLabel>Thanh toán</CardLabel><div className="space-y-3 text-[12px]"><div className="flex justify-between gap-3"><span className="text-dt-muted">Phí giao hàng</span><span>{formatVnd(Number(order.total_fee) || 0)}</span></div><div className="flex justify-between gap-3"><span className="text-dt-muted">COD thu hộ</span><span className="text-dt-yellow">{formatVnd(Number(order.cod_amount) || 0)}</span></div><div className="border-t border-dt-border pt-3"><div className="flex justify-between gap-3 font-medium"><span>Tổng cần đối soát</span><span>{formatVnd((Number(order.total_fee) || 0) + (Number(order.cod_amount) || 0))}</span></div></div></div><div className="mt-4 flex items-start gap-2 rounded-md border border-dt-green/20 bg-dt-green/5 p-3 text-[10px] leading-4 text-dt-muted"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-dt-green" />Thông tin đơn hàng được kiểm soát theo quyền của tài khoản.</div></Card>
      </div>

      <Card><div className="flex items-center gap-3"><Truck className="text-dt-yellow" size={18} /><div><CardLabel>Hành trình đơn hàng</CardLabel><p className="mt-1 text-[11px] text-dt-muted">Các mốc trạng thái đã ghi nhận</p></div></div><div className="mt-4 space-y-0">{timeline.map((event, index) => <div key={`${event.event_time}-${index}`} className="flex gap-3"><div className="flex w-5 shrink-0 flex-col items-center"><span className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full ${index === timeline.length - 1 ? "bg-dt-yellow text-dt-bg" : "border border-dt-green/40 text-dt-green"}`}><CheckCircle2 size={12} /></span>{index < timeline.length - 1 ? <span className="h-full min-h-8 w-px bg-dt-border" /> : null}</div><div className="pb-5"><p className="text-[12px] font-medium">{statusLabel(event.order_statuses)}</p><p className="mt-1 text-[10px] text-dt-muted">{formatDateTime(event.event_time)}{event.note ? ` · ${event.note}` : ""}</p></div></div>)}</div></Card>
    </>
  );
}

function PackageIcon(): React.JSX.Element {
  return <Box size={19} />;
}
