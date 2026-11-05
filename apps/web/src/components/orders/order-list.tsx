"use client";

import { ArrowUpRight, Package, PackageCheck, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { OrderStatusCode, type Paginated } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
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
const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: OrderStatusCode.CREATED, label: "Đã tạo đơn" },
  { value: OrderStatusCode.PENDING_ASSIGNMENT, label: "Chờ phân công" },
  { value: OrderStatusCode.ASSIGNED, label: "Đã phân công" },
  { value: OrderStatusCode.PICKED_UP, label: "Đã lấy hàng" },
  { value: OrderStatusCode.IN_WAREHOUSE, label: "Tại kho" },
  { value: OrderStatusCode.IN_TRANSIT, label: "Đang vận chuyển" },
  { value: OrderStatusCode.DELIVERING, label: "Đang giao hàng" },
  { value: OrderStatusCode.DELIVERED, label: "Giao thành công" },
  { value: OrderStatusCode.DELIVERY_FAILED, label: "Giao thất bại" },
  { value: OrderStatusCode.REDELIVERY, label: "Giao lại" },
  { value: OrderStatusCode.RETURNING, label: "Đang hoàn hàng" },
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
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const requestIdRef = useRef(0);

  const loadOrders = useCallback(async (): Promise<void> => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setNeedLogin(false);

    const query = new URLSearchParams({
      direction,
      page: String(pageNumber),
      pageSize: String(PAGE_SIZE),
    });
    if (statusFilter) query.set("status", statusFilter);
    if (search.trim()) query.set("q", search.trim());
    if (fromDate) query.set("from", fromDate);
    if (toDate) query.set("to", toDate);

    try {
      const page = await apiFetch<Paginated<OrderListItem>>(`/api/orders?${query.toString()}`);
      if (requestId !== requestIdRef.current) return;
      setOrders(page.items);
      setTotal(page.total);
      const lastPage = Math.max(1, Math.ceil(page.total / PAGE_SIZE));
      if (pageNumber > lastPage) {
        setPageNumber(lastPage);
        return;
      }
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      if (caught instanceof ApiError && caught.status === 401) {
        setNeedLogin(true);
      } else {
        setError(caught instanceof Error ? caught.message : "Không tải được danh sách đơn hàng");
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [direction, fromDate, pageNumber, search, statusFilter, toDate]);

  useEffect(() => {
    const timer = setTimeout(() => void loadOrders(), 250);
    return () => clearTimeout(timer);
  }, [loadOrders]);

  const isSent = direction === "sent";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Tìm mã, tên hoặc số điện thoại"
            value={search}
            maxLength={100}
            onChange={(event) => {
              setSearch(event.target.value);
              setPageNumber(1);
            }}
            placeholder="Mã vận đơn hoặc liên hệ"
            wrapperClassName="w-full sm:w-[280px]"
          />
          <SelectField
            label="Lọc trạng thái"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPageNumber(1);
            }}
            wrapperClassName="w-full sm:w-[220px]"
          >
            <option value="" className="bg-dt-panel2">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-dt-panel2">
                {option.label}
              </option>
            ))}
          </SelectField>
          <TextField label="Từ ngày tạo" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => { setFromDate(event.target.value); setPageNumber(1); }} />
          <TextField label="Đến ngày tạo" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => { setToDate(event.target.value); setPageNumber(1); }} />
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
            {search || statusFilter || fromDate || toDate
              ? "Không có đơn hàng phù hợp với tiêu chí tìm kiếm."
              : isSent
                ? "Chưa có đơn hàng do bạn đứng tên người gửi."
                : "Chưa có đơn hàng được gửi đến số điện thoại của bạn."}
          </p>
          {!search && !statusFilter && !fromDate && !toDate ? <p className="text-[12px] text-dt-muted">
            {isSent
              ? "Bạn có thể tạo đơn mới từ sổ địa chỉ của mình."
              : "Đơn nhận sẽ xuất hiện khi người gửi tạo đơn với số điện thoại này."}
          </p> : null}
          {isSent && !search && !statusFilter && !fromDate && !toDate ? (
            <Link href="/orders/new" className={`${buttonClassName()} mt-2 w-fit`}>
              Tạo đơn đầu tiên
            </Link>
          ) : !isSent && !search && !statusFilter && !fromDate && !toDate ? (
            <Link href="/orders/track" className={`${buttonClassName("secondary")} mt-2 w-fit`}>
              Tra cứu vận đơn
            </Link>
          ) : null}
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
      {total > 0 ? (
        <div className="flex items-center justify-between gap-3 text-[11px] text-dt-muted">
          <span>Trang {Math.min(pageNumber, totalPages)} / {totalPages} · {total} đơn hàng</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
              disabled={loading || pageNumber <= 1}
            >
              Trước
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPageNumber((current) => Math.min(totalPages, current + 1))}
              disabled={loading || pageNumber >= totalPages}
            >
              Sau
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
