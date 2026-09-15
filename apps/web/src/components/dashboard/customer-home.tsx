"use client";

import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock3,
  MapPin,
  Package,
  PackageCheck,
  Plus,
  Route,
  ShieldCheck,
  Truck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { OrderStatusCode, type ContactWithDefaultAddress, type Paginated } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  addressText,
  relationValue,
  statusClass,
  statusCode,
  statusLabel,
  type OrderListItem,
} from "@/lib/order-ui";

function OrderRow({ order, incoming }: { order: OrderListItem; incoming?: boolean }): React.JSX.Element {
  const otherContact = relationValue(incoming ? order.sender : order.receiver);
  const address = relationValue(incoming ? order.pickup_address : order.delivery_address);

  return (
    <Link href={`/orders/${order.id}`} className="flex items-center justify-between gap-4 border-b border-dt-border py-4 last:border-0 hover:bg-dt-panel2/30">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${incoming ? "bg-sky-400/10 text-sky-300" : "bg-dt-yellow/10 text-dt-yellow"}`}>
          {incoming ? <PackageCheck size={15} /> : <Package size={15} />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-dt-text">{order.tracking_code}</p>
          <p className="mt-1 truncate text-[10px] text-dt-muted">{incoming ? `Từ ${otherContact?.name ?? "—"}` : `Đến ${addressText(address)}`}</p>
        </div>
      </div>
      <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] ${statusClass(order.order_statuses)}`}>{statusLabel(order.order_statuses)}</span>
    </Link>
  );
}

export function CustomerHome(): React.JSX.Element {
  const [sentOrders, setSentOrders] = useState<OrderListItem[]>([]);
  const [receivedOrders, setReceivedOrders] = useState<OrderListItem[]>([]);
  const [contacts, setContacts] = useState<ContactWithDefaultAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadDashboard(): Promise<void> {
      try {
        const [sentPage, receivedPage, contactsPage] = await Promise.all([
          apiFetch<Paginated<OrderListItem>>("/api/orders?direction=sent&pageSize=100"),
          apiFetch<Paginated<OrderListItem>>("/api/orders?direction=received&pageSize=100"),
          apiFetch<Paginated<ContactWithDefaultAddress>>("/api/contacts?pageSize=100"),
        ]);
        if (!mounted) return;
        setSentOrders(sentPage.items);
        setReceivedOrders(receivedPage.items);
        setContacts(contactsPage.items);
      } catch (caught) {
        if (!mounted) return;
        setError(caught instanceof ApiError && caught.status === 401 ? "Phiên đăng nhập đã hết hạn." : caught instanceof Error ? caught.message : "Không tải được tổng quan");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadDashboard();
    return () => {
      mounted = false;
    };
  }, []);

  const allCustomerOrders = useMemo(() => {
    const unique = new Map<string, OrderListItem>();
    [...sentOrders, ...receivedOrders].forEach((order) => unique.set(order.id, order));
    return Array.from(unique.values());
  }, [receivedOrders, sentOrders]);
  const completedOrders = allCustomerOrders.filter((order) => statusCode(order.order_statuses) === OrderStatusCode.DELIVERED).length;
  const inProgressSent = sentOrders.filter((order) => statusCode(order.order_statuses) !== OrderStatusCode.DELIVERED).length;
  const inProgressReceived = receivedOrders.filter((order) => statusCode(order.order_statuses) !== OrderStatusCode.DELIVERED).length;
  const successRate = allCustomerOrders.length > 0 ? Math.round((completedOrders / allCustomerOrders.length) * 100) : 0;

  return (
    <>
      <PageHeader
        heading="Tổng quan khách hàng"
        subtitle="Quản lý các đơn bạn gửi, các đơn đang nhận và thông tin giao nhận của mình."
        action={<div className="flex flex-wrap gap-2"><Link href="/contacts/new" className={buttonClassName("secondary")}><Plus size={14} /> Thêm liên hệ</Link><Link href="/orders/new" className={buttonClassName()}><Plus size={14} /> Tạo đơn</Link></div>}
      />

      {error ? <Card><p className="text-[13px] text-dt-red">{error}</p><p className="text-[11px] text-dt-muted">Hãy tải lại trang sau khi kiểm tra phiên đăng nhập.</p></Card> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tổng quan đơn hàng">
        <MetricCard label="Đơn tôi gửi" value={loading ? "—" : sentOrders.length.toString().padStart(2, "0")} detail={`${inProgressSent} đơn đang xử lý`} icon={<Route className="text-dt-yellow" size={17} />} />
        <MetricCard label="Đơn tôi nhận" value={loading ? "—" : receivedOrders.length.toString().padStart(2, "0")} detail={`${inProgressReceived} đơn đang xử lý`} icon={<PackageCheck className="text-sky-300" size={17} />} />
        <MetricCard label="Đã hoàn tất" value={loading ? "—" : completedOrders.toString().padStart(2, "0")} detail={loading ? "Đang tính..." : `${successRate}% giao thành công`} icon={<CheckCircle2 className="text-dt-green" size={17} />} detailClassName="text-dt-green" />
        <MetricCard label="Sổ địa chỉ" value={loading ? "—" : contacts.length.toString().padStart(2, "0")} detail="Liên hệ có thể gửi và nhận" icon={<MapPin className="text-dt-yellow" size={17} />} />
      </section>

      <section className="mt-4 rounded-dt border border-dt-yellow/30 bg-dt-yellow/5 p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-dt-yellow text-dt-bg"><Truck size={18} /></span><div><p className="text-sm font-semibold">Bạn có thể vừa gửi vừa nhận hàng</p><p className="mt-1 max-w-2xl text-[11px] leading-5 text-dt-muted">Chọn liên hệ là “Cả hai” trong sổ địa chỉ. Hệ thống dùng vai trò của liên hệ ở từng đơn hàng, không tách thành hai tài khoản khách hàng.</p></div></div>
          <Link href="/contacts" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-dt-yellow/40 px-3 py-2 text-[10px] font-medium text-dt-yellow hover:bg-dt-yellow/10">Cập nhật sổ địa chỉ <ArrowUpRight size={13} /></Link>
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3"><div><CardLabel>Luồng gửi hàng</CardLabel><p className="mt-2 text-sm font-semibold">Đơn tôi gửi</p><p className="mt-1 text-[10px] text-dt-muted">Các đơn do bạn tạo hoặc đứng tên người gửi</p></div><Route className="text-dt-yellow" size={19} /></div>
          <div className="mt-2">{loading ? <p className="py-4 text-[11px] text-dt-muted">Đang tải...</p> : sentOrders.slice(0, 3).map((order) => <OrderRow key={order.id} order={order} />)}</div>
          {!loading && sentOrders.length === 0 ? <p className="py-4 text-[11px] text-dt-muted">Chưa có đơn gửi.</p> : null}
          <Link href="/orders/sent" className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dt-border py-2.5 text-[10px] text-dt-muted hover:text-dt-text">Xem toàn bộ đơn gửi <ArrowUpRight size={13} /></Link>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3"><div><CardLabel>Luồng nhận hàng</CardLabel><p className="mt-2 text-sm font-semibold">Đơn tôi nhận</p><p className="mt-1 text-[10px] text-dt-muted">Các đơn đang chuyển đến thông tin của bạn</p></div><PackageCheck className="text-sky-300" size={19} /></div>
          <div className="mt-2">{loading ? <p className="py-4 text-[11px] text-dt-muted">Đang tải...</p> : receivedOrders.slice(0, 3).map((order) => <OrderRow key={order.id} order={order} incoming />)}</div>
          {!loading && receivedOrders.length === 0 ? <p className="py-4 text-[11px] text-dt-muted">Chưa có đơn nhận.</p> : null}
          <Link href="/orders/received" className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dt-border py-2.5 text-[10px] text-dt-muted hover:text-dt-text">Xem toàn bộ đơn nhận <ArrowUpRight size={13} /></Link>
        </Card>
      </div>

      <section className="mt-4 grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2"><div className="flex items-center gap-3"><ShieldCheck className="text-dt-green" size={19} /><div><p className="text-sm font-semibold">Theo dõi và xác minh</p><p className="mt-1 text-[10px] text-dt-muted">Mỗi đơn đều có mã vận đơn và lịch sử trạng thái để bạn đối chiếu.</p></div></div><div className="mt-4 flex items-center gap-3 rounded-md bg-dt-panel2 p-3"><CheckCircle2 className="shrink-0 text-dt-green" size={16} /><p className="text-[10px] leading-5 text-dt-muted">Bạn có thể mở chi tiết từng đơn để xem QR, lịch sử trạng thái và dữ liệu xác minh.</p></div></Card>
        <Card><div className="flex items-center gap-3"><Bell className="text-dt-yellow" size={19} /><p className="text-sm font-semibold">Nhắc việc</p></div><div className="mt-4 space-y-3"><p className="flex items-start gap-2 text-[10px] leading-4 text-dt-muted"><Clock3 className="mt-0.5 shrink-0 text-dt-yellow" size={14} />Theo dõi các đơn đang xử lý để nhận biết mốc giao tiếp theo.</p><p className="flex items-start gap-2 text-[10px] leading-4 text-dt-muted"><WalletCards className="mt-0.5 shrink-0 text-dt-yellow" size={14} />COD được hiển thị ngay trong chi tiết đơn.</p></div></Card>
      </section>
    </>
  );
}

function MetricCard({ label, value, detail, icon, detailClassName }: { label: string; value: string; detail: string; icon: React.ReactNode; detailClassName?: string }): React.JSX.Element {
  return <div className="rounded-dt border border-dt-border bg-dt-panel p-4"><div className="flex items-center justify-between"><p className="text-[11px] text-dt-muted">{label}</p>{icon}</div><p className="mt-4 text-2xl font-semibold">{value}</p><p className={`mt-1 text-[10px] ${detailClassName ?? "text-dt-muted"}`}>{detail}</p></div>;
}
