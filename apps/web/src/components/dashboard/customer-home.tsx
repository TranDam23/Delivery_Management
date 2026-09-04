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
import { PageHeader } from "@/components/layout/page-header";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";

const OUTGOING_ORDERS = [
  { code: "DH20260904A1B2C3", destination: "Đà Nẵng", status: "Đang giao", tone: "warning" },
  { code: "DH20260903D4E5F6", destination: "Cần Thơ", status: "Đã giao", tone: "success" },
];

const INCOMING_ORDERS = [
  { code: "DH20260904G7H8I9", sender: "Công ty Minh Anh", status: "Đang vận chuyển", tone: "warning" },
  { code: "DH20260902J1K2L3", sender: "Nguyễn Hoàng Nam", status: "Đã giao", tone: "success" },
];

const STATUS_CLASS: Record<string, string> = {
  success: "bg-dt-green/10 text-dt-green",
  warning: "bg-dt-yellow/10 text-dt-yellow",
};

function OrderStatus({ status, tone }: { status: string; tone: string }): React.JSX.Element {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] ${STATUS_CLASS[tone] ?? "bg-dt-panel2 text-dt-muted"}`}>{status}</span>;
}

function OrderRow({
  code,
  detail,
  status,
  tone,
  incoming = false,
}: {
  code: string;
  detail: string;
  status: string;
  tone: string;
  incoming?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dt-border py-4 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${incoming ? "bg-sky-400/10 text-sky-300" : "bg-dt-yellow/10 text-dt-yellow"}`}>
          {incoming ? <PackageCheck size={15} /> : <Package size={15} />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-dt-text">{code}</p>
          <p className="mt-1 truncate text-[10px] text-dt-muted">{detail}</p>
        </div>
      </div>
      <OrderStatus status={status} tone={tone} />
    </div>
  );
}

/** Dashboard chung cho CUSTOMER: cung mot khong gian cho don gui va don nhan. */
export function CustomerHome(): React.JSX.Element {
  return (
    <>
      <PageHeader
        heading="Tổng quan khách hàng"
        subtitle="Quản lý các đơn bạn gửi, các đơn đang nhận và thông tin giao nhận của mình."
        action={
          <Link href="/contacts/new" className={buttonClassName()}>
            <Plus size={15} />
            Thêm liên hệ
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tổng quan đơn hàng">
        <div className="rounded-dt border border-dt-border bg-dt-panel p-4"><div className="flex items-center justify-between"><p className="text-[11px] text-dt-muted">Đơn tôi gửi</p><Route className="text-dt-yellow" size={17} /></div><p className="mt-4 text-2xl font-semibold">08</p><p className="mt-1 text-[10px] text-dt-muted">2 đơn đang giao</p></div>
        <div className="rounded-dt border border-dt-border bg-dt-panel p-4"><div className="flex items-center justify-between"><p className="text-[11px] text-dt-muted">Đơn tôi nhận</p><PackageCheck className="text-sky-300" size={17} /></div><p className="mt-4 text-2xl font-semibold">03</p><p className="mt-1 text-[10px] text-dt-muted">1 đơn đang vận chuyển</p></div>
        <div className="rounded-dt border border-dt-border bg-dt-panel p-4"><div className="flex items-center justify-between"><p className="text-[11px] text-dt-muted">Đã hoàn tất</p><CheckCircle2 className="text-dt-green" size={17} /></div><p className="mt-4 text-2xl font-semibold">16</p><p className="mt-1 text-[10px] text-dt-green">96% giao thành công</p></div>
        <div className="rounded-dt border border-dt-border bg-dt-panel p-4"><div className="flex items-center justify-between"><p className="text-[11px] text-dt-muted">Sổ địa chỉ</p><MapPin className="text-dt-yellow" size={17} /></div><p className="mt-4 text-2xl font-semibold">12</p><p className="mt-1 text-[10px] text-dt-muted">Liên hệ có thể gửi và nhận</p></div>
      </section>

      <section className="mt-4 rounded-dt border border-dt-yellow/30 bg-dt-yellow/5 p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-dt-yellow text-dt-bg"><Truck size={18} /></span><div><p className="text-sm font-semibold">Bạn có thể vừa gửi vừa nhận hàng</p><p className="mt-1 max-w-2xl text-[11px] leading-5 text-dt-muted">Chọn liên hệ là “Cả hai” trong sổ địa chỉ. Hệ thống dùng vai trò của liên hệ ở từng đơn hàng, không tách thành hai tài khoản khách hàng.</p></div></div>
          <Link href="/contacts/new" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-dt-yellow/40 px-3 py-2 text-[10px] font-medium text-dt-yellow hover:bg-dt-yellow/10">Cập nhật sổ địa chỉ <ArrowUpRight size={13} /></Link>
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3"><div><CardLabel>Luồng gửi hàng</CardLabel><p className="mt-2 text-sm font-semibold">Đơn tôi gửi</p><p className="mt-1 text-[10px] text-dt-muted">Các đơn do bạn tạo hoặc đứng tên người gửi</p></div><Route className="text-dt-yellow" size={19} /></div>
          <div className="mt-2">{OUTGOING_ORDERS.map((order) => <OrderRow key={order.code} code={order.code} detail={`Đến ${order.destination}`} status={order.status} tone={order.tone} />)}</div>
          <button type="button" className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dt-border py-2.5 text-[10px] text-dt-muted hover:text-dt-text">Xem toàn bộ đơn gửi <ArrowUpRight size={13} /></button>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3"><div><CardLabel>Luồng nhận hàng</CardLabel><p className="mt-2 text-sm font-semibold">Đơn tôi nhận</p><p className="mt-1 text-[10px] text-dt-muted">Các đơn đang chuyển đến thông tin của bạn</p></div><PackageCheck className="text-sky-300" size={19} /></div>
          <div className="mt-2">{INCOMING_ORDERS.map((order) => <OrderRow key={order.code} code={order.code} detail={`Từ ${order.sender}`} status={order.status} tone={order.tone} incoming />)}</div>
          <button type="button" className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dt-border py-2.5 text-[10px] text-dt-muted hover:text-dt-text">Xem toàn bộ đơn nhận <ArrowUpRight size={13} /></button>
        </Card>
      </div>

      <section className="mt-4 grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2"><div className="flex items-center gap-3"><ShieldCheck className="text-dt-green" size={19} /><div><p className="text-sm font-semibold">Theo dõi và xác minh</p><p className="mt-1 text-[10px] text-dt-muted">Mỗi đơn đều có mã vận đơn và lịch sử trạng thái để bạn đối chiếu.</p></div></div><div className="mt-4 flex items-center gap-3 rounded-md bg-dt-panel2 p-3"><CheckCircle2 className="shrink-0 text-dt-green" size={16} /><p className="text-[10px] leading-5 text-dt-muted">Các mốc quan trọng được ghi nhận trên Blockchain khi hệ thống hoàn tất tích hợp.</p></div></Card>
        <Card><div className="flex items-center gap-3"><Bell className="text-dt-yellow" size={19} /><p className="text-sm font-semibold">Nhắc việc</p></div><div className="mt-4 space-y-3"><p className="flex items-start gap-2 text-[10px] leading-4 text-dt-muted"><Clock3 className="mt-0.5 shrink-0 text-dt-yellow" size={14} />Đơn DH20260904A1B2C3 dự kiến giao trước 18:00.</p><p className="flex items-start gap-2 text-[10px] leading-4 text-dt-muted"><WalletCards className="mt-0.5 shrink-0 text-dt-yellow" size={14} />COD của một đơn đang chờ đối soát.</p></div></Card>
      </section>
    </>
  );
}
