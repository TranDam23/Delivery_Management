"use client";

import { AlertTriangle, RefreshCw, Search, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { fullShipperWarning, shipperIsFull, shipperOptionLabel, shipperTypeAllows, type ShipperLoad } from "@/lib/shipper-ui";

type ExceptionType = "WRONG_WAREHOUSE" | "WRONG_AREA" | "TRANSFER_FAILED" | "REASSIGNED" | "MANUAL_RETURN";

interface WarehouseRef { id: string; code: string; name: string; province: string }
interface WarehouseHit extends WarehouseRef { ward: string | null; warehouse_level: string }

interface Leg {
  id: string;
  sequence_no: number;
  leg_type: "PICKUP" | "TRANSFER" | "LAST_MILE";
  status: string;
  attempt_no: number;
  is_return: boolean;
  assigned_staff_id: string | null;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  from_warehouse: WarehouseRef | null;
  to_warehouse: WarehouseRef | null;
  staff: { id: string; full_name: string } | null;
}

interface ExceptionRow {
  id: string;
  exception_type: ExceptionType;
  reason: string;
  created_at: string;
  creator: { full_name: string } | null;
}

interface Detail {
  order: {
    id: string;
    tracking_code: string;
    delivery_warehouse: WarehouseRef | null;
    order_statuses: { code: string; name: string } | null;
    delivery_address: { address_line: string; ward: string | null; district: string | null; province: string | null } | null;
  };
  legs: Leg[];
  exceptions: ExceptionRow[];
}

interface RecentRow {
  id: string;
  exception_type: ExceptionType;
  reason: string;
  created_at: string;
  orders: { tracking_code: string } | null;
  creator: { full_name: string } | null;
}

interface StaffOption extends ShipperLoad { id: string; full_name: string; phone?: string | null; warehouse_id: string | null }

const TYPE_LABEL: Record<ExceptionType, string> = {
  WRONG_WAREHOUSE: "Nhập sai kho",
  WRONG_AREA: "Giao sai khu vực",
  TRANSFER_FAILED: "Chuyển kho thất bại",
  REASSIGNED: "Phân công lại",
  MANUAL_RETURN: "Hoàn hàng",
};
const LEG_LABEL = { PICKUP: "Lấy hàng", TRANSFER: "Trung chuyển", LAST_MILE: "Giao cuối" } as const;
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ", ASSIGNED: "Đã phân công", IN_PROGRESS: "Đang thực hiện", COMPLETED: "Hoàn tất", FAILED: "Thất bại", CANCELLED: "Đã hủy",
};

type Action =
  | { kind: "WRONG_WAREHOUSE"; leg: Leg }
  | { kind: "TRANSFER_FAILED"; leg: Leg }
  | { kind: "REASSIGNED"; leg: Leg }
  | { kind: "WRONG_AREA" }
  | { kind: "MANUAL_RETURN" };

function formatTime(value: string): string {
  return new Date(value).toLocaleString("vi-VN");
}

function warehouseLabel(warehouse: WarehouseRef | null): string {
  return warehouse ? `${warehouse.code} · ${warehouse.name}` : "—";
}

function WarehousePicker({ level, onPick, picked }: { level?: "COMMUNE"; onPick: (warehouse: WarehouseHit | null) => void; picked: WarehouseHit | null }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<WarehouseHit[]>([]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setHits([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      void apiFetch<{ warehouses: WarehouseHit[] }>(`/api/shipment-exceptions?warehouse_q=${encodeURIComponent(term)}${level ? `&level=${level}` : ""}`)
        .then((result) => { if (!cancelled) setHits(result.warehouses); })
        .catch(() => { if (!cancelled) setHits([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, level]);

  if (picked) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-dt border border-dt-yellow bg-dt-yellow/10 px-3 py-2 text-[12px]">
        <span>{picked.code} · {picked.name} · {picked.province}</span>
        <button type="button" aria-label="Bỏ chọn kho" onClick={() => onPick(null)}><X size={14} /></button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm kho theo mã, tên, phường/xã hoặc tỉnh"
        aria-label="Tìm kho"
        className="h-[38px] rounded-dt border border-dt-border bg-dt-panel2 px-3 text-[12px] text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none"
      />
      {hits.length > 0 ? (
        <ul className="max-h-[180px] overflow-y-auto rounded-dt border border-dt-border bg-dt-panel2">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" onClick={() => onPick(hit)} className="w-full px-3 py-2 text-left text-[12px] hover:bg-dt-panel">
                {hit.code} · {hit.name} <span className="text-dt-muted">· {hit.province}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ShipmentExceptionPage(): React.JSX.Element {
  const [code, setCode] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [warehouse, setWarehouse] = useState<WarehouseHit | null>(null);
  const [staffId, setStaffId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRecent = useCallback(async (): Promise<void> => {
    try {
      const result = await apiFetch<{ recent: RecentRow[] }>("/api/shipment-exceptions");
      setRecent(result.recent);
    } catch { /* danh sách gần đây chỉ mang tính tham khảo */ }
  }, []);

  useEffect(() => {
    void loadRecent();
    void apiFetch<StaffOption[]>("/api/delivery-staff").then(setStaff).catch(() => setStaff([]));
  }, [loadRecent]);

  const loadOrder = useCallback(async (trackingCode: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await apiFetch<Detail>(`/api/shipment-exceptions?tracking_code=${encodeURIComponent(trackingCode)}`));
    } catch (caught) {
      setDetail(null);
      setError(caught instanceof Error ? caught.message : "Không tải được đơn hàng");
    } finally {
      setLoading(false);
    }
  }, []);

  function openAction(next: Action): void {
    setAction(next);
    setReason("");
    setWarehouse(null);
    setStaffId("");
    setError(null);
    setNotice(null);
  }

  async function submit(): Promise<void> {
    if (!action || !detail) return;
    setBusy(true);
    setError(null);
    try {
      if (action.kind === "REASSIGNED") {
        await apiFetch(`/api/shipment-routes/legs/${action.leg.id}`, { method: "PATCH", body: JSON.stringify({ assigned_staff_id: staffId, reason }) });
      } else {
        const body = action.kind === "WRONG_WAREHOUSE"
          ? { type: action.kind, leg_id: action.leg.id, actual_warehouse_id: warehouse?.id, reason }
          : action.kind === "WRONG_AREA"
            ? { type: action.kind, order_id: detail.order.id, delivery_warehouse_id: warehouse?.id, reason }
            : action.kind === "MANUAL_RETURN"
              ? { type: action.kind, order_id: detail.order.id, reason }
              : { type: action.kind, leg_id: action.leg.id, reason };
        await apiFetch("/api/shipment-exceptions", { method: "POST", body: JSON.stringify(body) });
      }
      setNotice(`Đã xử lý: ${TYPE_LABEL[action.kind]}.`);
      setAction(null);
      await Promise.all([loadOrder(detail.order.tracking_code), loadRecent()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không xử lý được ngoại lệ");
    } finally {
      setBusy(false);
    }
  }

  const needsWarehouse = action?.kind === "WRONG_WAREHOUSE" || action?.kind === "WRONG_AREA";
  const canSubmit = Boolean(action) && reason.trim().length >= 3 && (!needsWarehouse || warehouse) && (action?.kind !== "REASSIGNED" || staffId);
  const forwardLegs = detail?.legs.filter((leg) => !leg.is_return) ?? [];
  const orderOpen = detail ? !["DELIVERED", "RETURNED", "CANCELLED", "RETURNING"].includes(detail.order.order_statuses?.code ?? "") : false;

  function legActions(leg: Leg): React.JSX.Element | null {
    if (!orderOpen || leg.is_return) return null;
    const buttons: React.JSX.Element[] = [];
    const small = "px-3 py-1.5 text-[11px]";
    if ((leg.leg_type === "PICKUP" || leg.leg_type === "TRANSFER") && leg.status === "IN_PROGRESS") {
      buttons.push(<Button key="wrong" variant="secondary" className={small} onClick={() => openAction({ kind: "WRONG_WAREHOUSE", leg })}>Nhập sai kho</Button>);
    }
    if (leg.leg_type === "TRANSFER" && leg.status === "IN_PROGRESS") {
      buttons.push(<Button key="fail" variant="secondary" className={small} onClick={() => openAction({ kind: "TRANSFER_FAILED", leg })}>Chuyển kho thất bại</Button>);
    }
    if (leg.leg_type !== "TRANSFER" && (leg.status === "PENDING" || leg.status === "ASSIGNED")) {
      buttons.push(<Button key="re" variant="secondary" className={small} onClick={() => openAction({ kind: "REASSIGNED", leg })}>{leg.assigned_staff_id ? "Phân công lại" : "Phân công"}</Button>);
    }
    return buttons.length ? <div className="flex flex-wrap gap-2">{buttons}</div> : null;
  }

  const reassignLeg = action?.kind === "REASSIGNED" ? action.leg : null;
  const reassignWarehouseId = reassignLeg ? (reassignLeg.leg_type === "PICKUP" ? reassignLeg.to_warehouse_id : reassignLeg.from_warehouse_id) : null;
  const candidates = staff.filter((member) => member.warehouse_id === reassignWarehouseId && member.id !== reassignLeg?.assigned_staff_id
    && (!reassignLeg || shipperTypeAllows(member.shipper_type ?? "BOTH", reassignLeg.leg_type)));
  const candidatesFree = candidates.filter((member) => !shipperIsFull(member));

  return (
    <div className="min-h-screen bg-dt-bg text-dt-text">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 py-6 md:px-8 md:py-8">
        <PageHeader
          heading="Ngoại lệ vận chuyển"
          subtitle="Xử lý nhập sai kho, giao sai khu vực, chuyển kho thất bại và phân công lại. Mọi xử lý đều được ghi nhật ký."
        />
        {error ? <p role="alert" className="rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
        {notice ? <p role="status" className="rounded-dt border border-dt-green/30 bg-dt-green/10 px-4 py-3 text-[12px] text-dt-green">{notice}</p> : null}

        <form
          onSubmit={(event) => { event.preventDefault(); if (code.trim()) void loadOrder(code.trim()); }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dt-muted" />
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Nhập mã vận đơn cần xử lý"
              aria-label="Mã vận đơn"
              className="h-[42px] w-full rounded-dt border border-dt-border bg-dt-panel2 pl-9 pr-3 text-[13px] text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none"
            />
          </div>
          <Button type="submit" disabled={loading || !code.trim()}>Tìm đơn</Button>
        </form>

        {detail ? (
          <>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[15px] font-semibold">{detail.order.tracking_code}</p>
                  <p className="text-[12px] text-dt-muted">
                    Trạng thái: {detail.order.order_statuses?.name ?? "—"} · Kho giao: {warehouseLabel(detail.order.delivery_warehouse)}
                  </p>
                  {detail.order.delivery_address ? (
                    <p className="text-[12px] text-dt-muted">
                      Giao tới: {[detail.order.delivery_address.address_line, detail.order.delivery_address.ward, detail.order.delivery_address.district, detail.order.delivery_address.province].filter(Boolean).join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={loading} onClick={() => void loadOrder(detail.order.tracking_code)}><RefreshCw size={13} /> Tải lại</Button>
                  {orderOpen ? <Button variant="secondary" onClick={() => openAction({ kind: "WRONG_AREA" })}><AlertTriangle size={13} /> Giao sai khu vực</Button> : null}
                  {orderOpen ? <Button variant="secondary" onClick={() => openAction({ kind: "MANUAL_RETURN" })}><Undo2 size={13} /> Hoàn hàng</Button> : null}
                </div>
              </div>
              {!orderOpen ? <p className="text-[12px] text-dt-muted">Đơn đã kết thúc hoặc đang hoàn hàng nên không xử lý ngoại lệ được.</p> : null}
            </Card>

            <Card>
              <CardLabel>Các chặng vận chuyển</CardLabel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[12px]">
                  <thead className="text-dt-muted">
                    <tr><th className="py-2 pr-3">#</th><th className="pr-3">Loại</th><th className="pr-3">Từ → Đến</th><th className="pr-3">Trạng thái</th><th className="pr-3">Shipper</th><th>Thao tác</th></tr>
                  </thead>
                  <tbody>
                    {detail.legs.map((leg) => (
                      <tr key={leg.id} className="border-t border-dt-border align-top">
                        <td className="py-2 pr-3">{leg.sequence_no}{leg.is_return ? "·hoàn" : ""}</td>
                        <td className="pr-3">{LEG_LABEL[leg.leg_type]}</td>
                        <td className="pr-3">{leg.from_warehouse ? warehouseLabel(leg.from_warehouse) : "Người gửi"} → {leg.to_warehouse ? warehouseLabel(leg.to_warehouse) : "Người nhận"}</td>
                        <td className="pr-3">{STATUS_LABEL[leg.status] ?? leg.status}{leg.attempt_no > 1 ? ` (lần ${leg.attempt_no})` : ""}</td>
                        <td className="pr-3">{leg.staff?.full_name ?? "—"}</td>
                        <td>{legActions(leg)}</td>
                      </tr>
                    ))}
                    {forwardLegs.length === 0 ? <tr><td colSpan={6} className="py-4 text-center text-dt-muted">Đơn chưa được lập tuyến.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </Card>

            {action ? (
              <Card className="border-dt-yellow">
                <CardLabel>{TYPE_LABEL[action.kind]}</CardLabel>
                {action.kind === "WRONG_WAREHOUSE" ? <p className="text-[12px] text-dt-muted">Chọn kho thực tế đang giữ hàng. Chặng {action.leg.sequence_no} sẽ được ghi nhận đã nhập tại kho này và các chặng phía sau được lập lại từ đó.</p> : null}
                {action.kind === "WRONG_AREA" ? <p className="text-[12px] text-dt-muted">Chọn kho giao đúng khu vực. Các chặng chưa bắt đầu sẽ được lập lại từ kho đang giữ hàng đến kho giao mới.</p> : null}
                {action.kind === "MANUAL_RETURN" ? <p className="text-[12px] text-dt-muted">Hàng đang ở kho sẽ được đưa về kho lấy hàng ban đầu rồi trả cho người gửi. Các chặng giao chưa bắt đầu bị gỡ, đơn chuyển sang trạng thái đang hoàn. Chỉ dùng được khi hàng đang nằm ở kho (không có chặng nào đang chạy).</p> : null}
                {action.kind === "TRANSFER_FAILED" ? <p className="text-[12px] text-dt-muted">Chặng {action.leg.sequence_no} quay về trạng thái chờ xuất kho (lần {action.leg.attempt_no + 1}); kho gửi sẽ xuất lại.</p> : null}
                {action.kind === "REASSIGNED" ? (
                  <label className="flex flex-col gap-1 text-[11px] text-dt-muted">
                    Shipper mới (cùng kho vận hành)
                    <select value={staffId} onChange={(event) => setStaffId(event.target.value)} className="h-[38px] rounded-dt border border-dt-border bg-dt-panel2 px-3 text-[12px] text-dt-text">
                      <option value="">— Chọn shipper —</option>
                      {candidates.map((member) => <option key={member.id} value={member.id} disabled={shipperIsFull(member)}>{shipperOptionLabel(member)}</option>)}
                    </select>
                    {candidates.length === 0 ? <span>Không có shipper khác phù hợp thuộc kho này.</span> : null}
                    {candidates.length > 0 && candidatesFree.length === 0 ? <span className="text-red-300">Tất cả shipper phù hợp của kho này đã đủ số đơn trong ngày hôm nay.</span> : null}
                    {candidatesFree.length > 0 && fullShipperWarning(candidates) ? <span className="text-yellow-300">{fullShipperWarning(candidates)}</span> : null}
                  </label>
                ) : null}
                {needsWarehouse ? <WarehousePicker level={action.kind === "WRONG_AREA" ? "COMMUNE" : undefined} picked={warehouse} onPick={setWarehouse} /> : null}
                <label className="flex flex-col gap-1 text-[11px] text-dt-muted">
                  Lý do (bắt buộc)
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={2} className="rounded-dt border border-dt-border bg-dt-panel2 px-3 py-2 text-[12px] text-dt-text focus:border-dt-yellow focus:outline-none" />
                </label>
                <div className="flex gap-2">
                  <Button disabled={busy || !canSubmit} onClick={() => void submit()}>{busy ? "Đang xử lý..." : "Xác nhận xử lý"}</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>Hủy</Button>
                </div>
              </Card>
            ) : null}

            <Card>
              <CardLabel>Lịch sử ngoại lệ của đơn</CardLabel>
              {detail.exceptions.length === 0 ? <p className="text-[12px] text-dt-muted">Chưa có ngoại lệ nào.</p> : (
                <ul className="flex flex-col gap-2 text-[12px]">
                  {detail.exceptions.map((item) => (
                    <li key={item.id} className="rounded-dt border border-dt-border bg-dt-panel2 px-3 py-2">
                      <span className="font-medium">{TYPE_LABEL[item.exception_type]}</span> · {formatTime(item.created_at)} · {item.creator?.full_name ?? "—"}
                      <p className="text-dt-muted">{item.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        ) : (
          <Card>
            <CardLabel>Ngoại lệ gần đây</CardLabel>
            {recent.length === 0 ? <p className="text-[12px] text-dt-muted">Chưa có ngoại lệ nào. Nhập mã vận đơn để bắt đầu xử lý.</p> : (
              <ul className="flex flex-col gap-2 text-[12px]">
                {recent.map((item) => (
                  <li key={item.id} className="rounded-dt border border-dt-border bg-dt-panel2 px-3 py-2">
                    <button type="button" className="text-left" onClick={() => { const trackingCode = item.orders?.tracking_code; if (trackingCode) { setCode(trackingCode); void loadOrder(trackingCode); } }}>
                      <span className="font-medium">{item.orders?.tracking_code ?? "—"}</span> · {TYPE_LABEL[item.exception_type]} · {formatTime(item.created_at)} · {item.creator?.full_name ?? "—"}
                      <span className="block text-dt-muted">{item.reason}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
