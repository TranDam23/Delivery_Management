"use client";

import { ArrowUpRight, Package, PackageCheck, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OrderStatusCode, type Paginated } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  addressText,
  formatDateTime,
  formatVnd,
  relationValue,
  statusClass,
  statusLabel,
  type OrderListItem,
} from "@/lib/order-ui";

export type OrderDirection = "sent" | "received";

const STATUS_OPTIONS = [
  { value: OrderStatusCode.CREATED, label: "Đã tạo đơn" },
  { value: OrderStatusCode.PICKED_UP, label: "Đã lấy hàng" },
  { value: OrderStatusCode.IN_TRANSIT, label: "Đang vận chuyển" },
  { value: OrderStatusCode.DELIVERING, label: "Đang giao hàng" },
  { value: OrderStatusCode.DELIVERED, label: "Giao thành công" },
  { value: OrderStatusCode.DELIVERY_FAILED, label: "Giao thất bại" },
  { value: OrderStatusCode.RETURNED, label: "Đã hoàn hàng" },
  { value: OrderStatusCode.CANCELLED, label: "Đã hủy" },
];

interface OrderListPageProps {
  direction: OrderDirection;
}

function OrderListRow({ order, direction }: { order: OrderListItem; direction: OrderDirection }): React.JSX.Element {
  const contact = relationValue(direction === "sent" ? order.receiver : order.sender);
  const address = relationValue(direction === "sent" ? order.delivery_address : order.pickup_address);

  return (
    <tr className="border-b border-dt-border/70 last:border-0">
      <td className="px-3 py-4 align-top">
        <Link href={`/orders/${order.id}`} className="font-medium text-dt-yellow hover:underline">
          {order.tracking_code}
        </Link>
        <p className="mt-1 text-[10px] text-dt-muted">{formatDateTime(order.created_at)}</p>
      </td>
      <td className="px-3 py-4 align-top">
        <p className="text-[12px] text-dt-text">{contact?.name ?? "Chưa có thông tin"}</p>
        <p className="mt-1 text-[10px] text-dt-muted">{contact?.phone ?? "—"}</p>
      </td>
      <td className="max-w-[280px] px-3 py-4 align-top text-[11px] leading-5 text-dt-muted">
        {direction === "sent" ? "Đến" : "Nhận tại"}: {addressText(address)}
      </td>
      <td className="px-3 py-4 align-top">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${statusClass(order.order_statuses)}`}>
          {statusLabel(order.order_statuses)}
        </span>
      </td>
      <td className="px-3 py-4 text-right align-top text-[11px] text-dt-muted">
        {formatVnd(Number(order.total_fee) || 0)}
      </td>
      <td className="px-3 py-4 text-right align-top">
        <Link
          href={`/orders/${order.id}`}
          aria-label={`Xem chi tiết ${order.tracking_code}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dt-border text-dt-muted hover:border-dt-yellow/50 hover:text-dt-yellow"
        >
          <ArrowUpRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

export function OrderListPage({ direction }: OrderListPageProps): React.JSX.Element {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  const loadOrders = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setNeedLogin(false);

    const query = new URLSearchParams({ direction, pageSize: "100" });
    if (statusFilter) query.set("status", statusFilter);

    try {
      const page = await apiFetch<Paginated<OrderListItem>>(`/api/orders?${query.toString()}`);
      setOrders(page.items);
      setTotal(page.total);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setNeedLogin(true);
      } else {
        setError(caught instanceof Error ? caught.message : "Không tải được danh sách đơn hàng");
      }
    } finally {
      setLoading(false);
    }
  }, [direction, statusFilter]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const isSent = direction === "sent";

  return (
    <>
      <PageHeader
        heading={isSent ? "Đơn tôi gửi" : "Đơn tôi nhận"}
        subtitle={isSent ? "Các đơn hàng bạn đứng tên người gửi." : "Các đơn hàng đang chuyển đến thông tin của bạn."}
        action={
          isSent ? (
            <Link href="/orders/new" className={buttonClassName()}>
              <Plus size={15} />
              Tạo đơn hàng
            </Link>
          ) : (
            <Link href="/orders/track" className={buttonClassName("secondary")}>
              Tra cứu vận đơn
            </Link>
          )
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-dt-muted">
          {isSent ? <Package size={15} className="text-dt-yellow" /> : <PackageCheck size={15} className="text-sky-300" />}
          <span>{total} đơn hàng</span>
        </div>
        <div className="flex items-end gap-2">
          <SelectField
            label="Lọc trạng thái"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            wrapperClassName="w-[220px]"
          >
            <option value="" className="bg-dt-panel2">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-dt-panel2">
                {option.label}
              </option>
            ))}
          </SelectField>
          <Button variant="secondary" onClick={() => void loadOrders()} disabled={loading} aria-label="Tải lại">
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
      </div>

      {needLogin ? (
        <Card>
          <p className="text-[13px]">Phiên đăng nhập đã hết hạn hoặc bạn chưa đăng nhập.</p>
          <Link href="/login" className="text-[12px] text-dt-yellow hover:underline">Đăng nhập lại</Link>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <p className="text-[13px] text-dt-red">{error}</p>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <p className="text-[13px] text-dt-muted">Đang tải danh sách đơn hàng...</p>
        </Card>
      ) : null}

      {!loading && !needLogin && !error && orders.length === 0 ? (
        <Card>
          <p className="text-[13px]">
            {isSent ? "Chưa có đơn hàng do bạn đứng tên người gửi." : "Chưa có đơn hàng được gửi đến số điện thoại của bạn."}
          </p>
          <p className="text-[12px] text-dt-muted">
            {isSent
              ? "Bạn có thể tạo đơn mới từ sổ địa chỉ của mình."
              : "Đơn nhận sẽ xuất hiện khi người gửi tạo đơn với số điện thoại này."}
          </p>
          {isSent ? (
            <Link href="/orders/new" className={`${buttonClassName()} mt-2 w-fit`}>
              Tạo đơn đầu tiên
            </Link>
          ) : (
            <Link href="/orders/track" className={`${buttonClassName("secondary")} mt-2 w-fit`}>
              Tra cứu vận đơn
            </Link>
          )}
        </Card>
      ) : null}

      {orders.length > 0 ? (
        <div className="overflow-x-auto rounded-dt border border-dt-border">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="bg-dt-panel2 text-[10px] uppercase tracking-wide text-dt-muted">
                <th className="px-3 py-3 font-medium">Mã vận đơn</th>
                <th className="px-3 py-3 font-medium">{isSent ? "Người nhận" : "Người gửi"}</th>
                <th className="px-3 py-3 font-medium">{isSent ? "Địa chỉ giao" : "Địa chỉ nhận"}</th>
                <th className="px-3 py-3 font-medium">Trạng thái</th>
                <th className="px-3 py-3 text-right font-medium">Phí giao</th>
                <th className="px-3 py-3 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => <OrderListRow key={order.id} order={order} direction={direction} />)}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
