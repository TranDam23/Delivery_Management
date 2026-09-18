"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  RefreshCw,
  ScanLine,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PackageCondition,
  ShipmentLegStatusCode,
  ShipmentLegType,
  WarehouseEventType,
  type Warehouse,
} from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, formatVnd, relationValue } from "@/lib/order-ui";
import { legStatusLabel, legTypeLabel } from "@/lib/shipment-routing";
import {
  computeLegStates,
  itemSummary,
  warehouseName,
  type LegState,
  type WarehouseAddress,
  type WarehouseOperationLeg,
  type WarehouseOperationsResponse,
} from "./warehouse-legs";

interface RecordEventResponse {
  returnRoute: { legs: unknown[] } | null;
  returnRouteError: string | null;
}

interface InspectionDraft {
  condition: PackageCondition;
  weight: string;
  note: string;
}

type Tab = "inbound" | "outbound" | "all";

const TABS: Tab[] = ["inbound", "outbound", "all"];
const PAGE_SIZE = 15;
const EMPTY_INSPECTION: InspectionDraft = { condition: PackageCondition.INTACT, weight: "", note: "" };

const STATE_BADGE: Record<LegState, { label: string; tone: string }> = {
  INBOUND: { label: "Chờ nhập kho", tone: "bg-sky-400/15 text-sky-300" },
  RETURN_INBOUND: { label: "Chờ nhận lại", tone: "bg-orange-400/15 text-orange-300" },
  OUTBOUND: { label: "Chờ xuất kho", tone: "bg-dt-yellow/15 text-dt-yellow" },
  HOLDING: { label: "Chờ phân công shipper", tone: "bg-dt-panel2 text-dt-text" },
  INCOMING: { label: "Sắp đến", tone: "bg-dt-panel2 text-dt-muted" },
  OTHER: { label: "", tone: "" },
};

function addressLabel(address: WarehouseAddress | null): string {
  if (!address) return "Chưa có địa chỉ";
  return [address.address_line, address.ward, address.district, address.province].filter(Boolean).join(", ");
}

function statusChip(status: string): string {
  if (status === ShipmentLegStatusCode.COMPLETED) return "text-dt-green";
  if (status === ShipmentLegStatusCode.FAILED || status === ShipmentLegStatusCode.CANCELLED) return "text-red-300";
  if (status === ShipmentLegStatusCode.IN_PROGRESS) return "text-sky-300";
  return "text-dt-muted";
}

function readTabFromUrl(): Tab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return TABS.includes(value as Tab) ? (value as Tab) : "inbound";
}

export function WarehouseOperationsPage(): React.JSX.Element {
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [legs, setLegs] = useState<WarehouseOperationLeg[]>([]);
  const [tab, setTab] = useState<Tab>("inbound");
  const [page, setPage] = useState(1);
  const [searchCode, setSearchCode] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inspectionByLeg, setInspectionByLeg] = useState<Record<string, InspectionDraft>>({});

  const loadOperations = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<WarehouseOperationsResponse>("/api/warehouse-operations");
      setWarehouse(result.warehouse);
      setLegs(result.legs);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được chặng vận hành của kho");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setTab(readTabFromUrl());
    void loadOperations();
  }, [loadOperations]);

  function changeTab(next: Tab): void {
    setTab(next);
    setPage(1);
    setExpandedId(null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  const stateById = useMemo(() => computeLegStates(legs, warehouse?.id), [legs, warehouse?.id]);

  const stateOf = useCallback((leg: WarehouseOperationLeg): LegState => stateById.get(leg.id) ?? "OTHER", [stateById]);

  const counts = useMemo(() => ({
    inbound: legs.filter((leg) => ["INBOUND", "RETURN_INBOUND"].includes(stateOf(leg))).length,
    outbound: legs.filter((leg) => stateOf(leg) === "OUTBOUND").length,
    holding: legs.filter((leg) => stateOf(leg) === "HOLDING").length,
    incoming: legs.filter((leg) => stateOf(leg) === "INCOMING").length,
    all: legs.length,
  }), [legs, stateOf]);

  /** Danh sách chính và mục phụ của tab; việc cần làm luôn đứng đầu, cũ nhất trước. */
  const { primary, secondary, secondaryTitle } = useMemo(() => {
    const code = searchCode.trim().toUpperCase();
    const matches = (leg: WarehouseOperationLeg) =>
      !code || (relationValue(leg.orders)?.tracking_code.toUpperCase().includes(code) ?? false);
    const oldestFirst = (a: WarehouseOperationLeg, b: WarehouseOperationLeg) => a.updated_at.localeCompare(b.updated_at);
    const newestFirst = (a: WarehouseOperationLeg, b: WarehouseOperationLeg) => b.updated_at.localeCompare(a.updated_at);
    const pick = (states: LegState[]) => legs.filter((leg) => matches(leg) && states.includes(stateOf(leg)));

    if (tab === "inbound") {
      return { primary: pick(["INBOUND", "RETURN_INBOUND"]).sort(oldestFirst), secondary: pick(["INCOMING"]).sort(oldestFirst), secondaryTitle: "Sắp đến kho" };
    }
    if (tab === "outbound") {
      return { primary: pick(["OUTBOUND"]).sort(oldestFirst), secondary: pick(["HOLDING"]).sort(oldestFirst), secondaryTitle: "Đang giữ tại kho · chờ điều phối phân công shipper" };
    }
    const rank: Record<LegState, number> = { INBOUND: 0, RETURN_INBOUND: 0, OUTBOUND: 0, HOLDING: 1, INCOMING: 2, OTHER: 3 };
    const all = legs.filter(matches).sort((a, b) => rank[stateOf(a)] - rank[stateOf(b)]
      || (rank[stateOf(a)] === 0 ? oldestFirst(a, b) : newestFirst(a, b)));
    return { primary: all, secondary: [] as WarehouseOperationLeg[], secondaryTitle: "" };
  }, [legs, searchCode, stateOf, tab]);

  const pageCount = Math.max(1, Math.ceil(primary.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedPrimary = primary.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function inspectionFor(legId: string): InspectionDraft {
    return inspectionByLeg[legId] ?? EMPTY_INSPECTION;
  }

  function setInspection(legId: string, patch: Partial<InspectionDraft>): void {
    setInspectionByLeg((current) => ({ ...current, [legId]: { ...(current[legId] ?? EMPTY_INSPECTION), ...patch } }));
  }

  async function recordEvent(leg: WarehouseOperationLeg, eventType: WarehouseEventType): Promise<void> {
    if (!warehouse || busyKey) return;
    const trackingCode = relationValue(leg.orders)?.tracking_code ?? "đơn hàng";
    const isInbound = eventType === WarehouseEventType.INBOUND;
    const inspection = inspectionFor(leg.id);
    const weightText = inspection.weight.trim().replace(",", ".");
    const weight = weightText ? Number(weightText) : undefined;
    if (isInbound && weight !== undefined && (!Number.isFinite(weight) || weight <= 0)) {
      setError("Cân nặng thực tế phải là số lớn hơn 0.");
      return;
    }
    if (isInbound && inspection.condition === PackageCondition.DAMAGED && !inspection.note.trim()) {
      setError("Vui lòng mô tả tình trạng hư hỏng của kiện hàng.");
      return;
    }

    setBusyKey(leg.id);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<RecordEventResponse>(`/api/shipment-routes/legs/${leg.id}/events`, {
        method: "POST",
        body: JSON.stringify({
          warehouse_id: warehouse.id,
          event_type: eventType,
          ...(isInbound
            ? { package_condition: inspection.condition, actual_weight_kg: weight, note: inspection.note.trim() || undefined }
            : {}),
        }),
      });
      const action = !isInbound
        ? "Đã xuất kho"
        : leg.leg_type === ShipmentLegType.LAST_MILE ? "Đã nhận lại hàng giao thất bại" : "Đã kiểm hàng và nhập kho";
      const returnNote = result.returnRoute
        ? " Đơn đã hết số lần giao, hệ thống đã lập tuyến hoàn về người gửi."
        : result.returnRouteError ? ` Chưa lập được tuyến hoàn: ${result.returnRouteError}` : "";
      setNotice(`${action} ${trackingCode}.${returnNote}`);
      setExpandedId(null);
      setInspectionByLeg((current) => {
        const next = { ...current };
        delete next[leg.id];
        return next;
      });
      await loadOperations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể ghi nhận thao tác kho");
    } finally {
      setBusyKey(null);
    }
  }

  /** Mô tả hướng đi của chặng so với kho hiện tại. */
  function directionText(leg: WarehouseOperationLeg, state: LegState): string {
    const order = relationValue(leg.orders);
    const from = relationValue(leg.from_warehouse);
    const to = relationValue(leg.to_warehouse);
    if (state === "RETURN_INBOUND") return "Shipper mang hàng giao thất bại về kho";
    if (leg.from_warehouse_id === warehouse?.id) {
      if (to) return `Xuất đến ${warehouseName(to)}`;
      const address = relationValue(leg.is_return ? order?.pickup_address ?? null : order?.delivery_address ?? null);
      return `${leg.is_return ? "Giao hoàn cho người gửi" : "Giao cho người nhận"} · ${address?.ward ?? address?.province ?? ""}`;
    }
    if (from) return `Nhập từ ${warehouseName(from)}`;
    return "Shipper lấy hàng từ người gửi";
  }

  function renderInspection(leg: WarehouseOperationLeg): React.JSX.Element {
    const inspection = inspectionFor(leg.id);
    const isDamaged = inspection.condition === PackageCondition.DAMAGED;
    return (
      <div className="grid gap-3 md:grid-cols-[190px_170px_minmax(0,1fr)]">
        <SelectField label="Tình trạng kiện" value={inspection.condition} onChange={(event) => setInspection(leg.id, { condition: event.target.value as PackageCondition })}>
          <option value={PackageCondition.INTACT} className="bg-dt-panel2">Nguyên vẹn</option>
          <option value={PackageCondition.DAMAGED} className="bg-dt-panel2">Hư hỏng / móp / ướt</option>
        </SelectField>
        <TextField label="Cân nặng thực tế (kg)" inputMode="decimal" value={inspection.weight} onChange={(event) => setInspection(leg.id, { weight: event.target.value })} placeholder="Không bắt buộc" />
        <TextField
          label={isDamaged ? "Mô tả hư hỏng *" : "Ghi chú kiểm hàng"}
          value={inspection.note}
          onChange={(event) => setInspection(leg.id, { note: event.target.value })}
          placeholder={isDamaged ? "Ví dụ: móp góc hộp, rách băng keo" : "Không bắt buộc"}
        />
      </div>
    );
  }

  function renderDetail(leg: WarehouseOperationLeg, state: LegState): React.JSX.Element {
    const order = relationValue(leg.orders);
    const sender = relationValue(order?.pickup_address ?? null);
    const receiver = relationValue(order?.delivery_address ?? null);
    const from = relationValue(leg.from_warehouse);
    const to = relationValue(leg.to_warehouse);
    const needsInspection = state === "INBOUND" || state === "RETURN_INBOUND";
    const busy = busyKey === leg.id;

    return (
      <div className="space-y-4 border-t border-dt-border px-4 py-4">
        <div className="grid gap-3 text-[12px] leading-5 md:grid-cols-3">
          <div className="rounded-md bg-dt-panel p-3">
            <p className="text-[10px] uppercase tracking-wide text-dt-muted">Hàng hóa</p>
            {(order?.order_items ?? []).length === 0 ? <p className="mt-1 text-dt-muted">Chưa khai báo</p> : (
              <ul className="mt-1 space-y-0.5">
                {(order?.order_items ?? []).map((item, index) => (
                  <li key={`${item.item_name}-${index}`}>{item.item_name} ×{item.quantity}{item.weight ? ` · ${item.weight} kg` : ""}</li>
                ))}
              </ul>
            )}
            {Number(order?.cod_amount) > 0 ? <p className="mt-1">COD: <strong className="text-dt-yellow">{formatVnd(Number(order?.cod_amount))}</strong></p> : null}
            {order?.note ? <p className="mt-1 text-dt-muted">Lưu ý: {order.note}</p> : null}
          </div>
          <div className="rounded-md bg-dt-panel p-3">
            <p className="text-[10px] uppercase tracking-wide text-dt-muted">Chặng {leg.sequence_no} · {legTypeLabel(leg.leg_type, leg.is_return)}{leg.attempt_no > 1 ? ` · lần ${leg.attempt_no}` : ""}</p>
            <p className="mt-1">Từ: {from ? `${from.code} · ${from.name}` : `Người gửi · ${addressLabel(sender)}`}</p>
            <p>Đến: {to ? `${to.code} · ${to.name}` : leg.is_return ? `Người gửi · ${addressLabel(sender)}` : `Người nhận · ${addressLabel(receiver)}`}</p>
            <p className={`mt-1 ${statusChip(leg.status)}`}>{legStatusLabel(leg.status)} · cập nhật {formatDateTime(leg.updated_at)}</p>
          </div>
          <div className="rounded-md bg-dt-panel p-3">
            <p className="text-[10px] uppercase tracking-wide text-dt-muted">Người gửi → người nhận</p>
            <p className="mt-1">{sender?.recipient_name ?? "—"}{sender?.phone ? ` · ${sender.phone}` : ""}</p>
            <p>{receiver?.recipient_name ?? "—"}{receiver?.phone ? ` · ${receiver.phone}` : ""}</p>
            <p className="text-dt-muted">{receiver ? `${receiver.ward ?? ""}, ${receiver.province ?? ""}` : ""}</p>
          </div>
        </div>

        {leg.warehouse_events.length > 0 ? (
          <div className="text-[12px]">
            <p className="text-[10px] uppercase tracking-wide text-dt-muted">Lịch sử tại kho này</p>
            <ul className="mt-1 space-y-1">
              {leg.warehouse_events.map((event) => (
                <li key={event.id} className="text-dt-muted">
                  <span className="text-dt-text">{event.event_type === WarehouseEventType.INBOUND ? "Nhập kho" : "Xuất kho"}</span>
                  {" · "}{formatDateTime(event.event_time)}{event.attempt_no > 1 ? ` · lần ${event.attempt_no}` : ""}
                  {event.package_condition === PackageCondition.DAMAGED ? <span className="text-red-300"> · Hư hỏng</span> : null}
                  {event.actual_weight_kg ? ` · ${event.actual_weight_kg} kg` : ""}
                  {event.note ? ` · ${event.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {needsInspection ? renderInspection(leg) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {needsInspection ? (
            <Button disabled={busy} onClick={() => void recordEvent(leg, WarehouseEventType.INBOUND)}>
              <ArrowDownToLine size={14} /> {busy ? "Đang ghi nhận..." : state === "RETURN_INBOUND" ? "Nhận lại hàng" : "Xác nhận nhập kho"}
            </Button>
          ) : null}
          {state === "OUTBOUND" ? (
            <Button disabled={busy} onClick={() => void recordEvent(leg, WarehouseEventType.OUTBOUND)}>
              <ArrowUpFromLine size={14} /> {busy ? "Đang ghi nhận..." : leg.leg_type === ShipmentLegType.LAST_MILE ? "Xuất kho giao shipper" : "Xác nhận xuất kho"}
            </Button>
          ) : null}
          {state === "HOLDING" ? <p className="text-[12px] text-dt-muted">Hàng đang ở kho. Chờ điều phối viên phân công shipper giao.</p> : null}
          {state === "INCOMING" ? <p className="text-[12px] text-dt-muted">Hàng chưa tới kho. Khi kho gửi xuất kho (hoặc shipper lấy hàng xong), đơn chuyển sang &ldquo;Chờ nhập kho&rdquo;.</p> : null}
        </div>
      </div>
    );
  }

  function renderRow(leg: WarehouseOperationLeg): React.JSX.Element {
    const order = relationValue(leg.orders);
    const state = stateOf(leg);
    const expanded = expandedId === leg.id;
    const badge = STATE_BADGE[state];
    const actionable = state === "INBOUND" || state === "RETURN_INBOUND" || state === "OUTBOUND";

    return (
      <li key={leg.id} className={`overflow-hidden rounded-dt border bg-dt-panel2 ${actionable ? "border-dt-yellow/35" : "border-dt-border"}`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => setExpandedId(expanded ? null : leg.id)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${state === "OUTBOUND" || state === "HOLDING" ? "bg-dt-yellow/10 text-dt-yellow" : "bg-sky-400/10 text-sky-300"}`}>
              {state === "OUTBOUND" || state === "HOLDING" || (state === "OTHER" && leg.from_warehouse_id === warehouse?.id) ? <ArrowUpFromLine size={16} /> : <ArrowDownToLine size={16} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] font-semibold text-dt-yellow">{order?.tracking_code ?? "—"}</span>
                {leg.is_return ? <span className="rounded bg-orange-400/15 px-1.5 text-[10px] text-orange-300">Hoàn</span> : null}
                {leg.attempt_no > 1 ? <span className="text-[10px] text-dt-muted">Lần {leg.attempt_no}</span> : null}
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-dt-text">{itemSummary(order)}</span>
              <span className="mt-0.5 block truncate text-[11px] text-dt-muted">{directionText(leg, state)}</span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {badge.label
              ? <span className={`hidden rounded-full px-2 py-0.5 text-[10px] sm:inline ${badge.tone}`}>{badge.label}</span>
              : <span className={`hidden text-[10px] sm:inline ${statusChip(leg.status)}`}>{leg.status === ShipmentLegStatusCode.PENDING || leg.status === ShipmentLegStatusCode.ASSIGNED ? "Chờ hàng về kho" : legStatusLabel(leg.status)}</span>}
            {state === "OUTBOUND" ? (
              <Button variant="secondary" className="px-3 py-1.5 text-[11px]" disabled={busyKey === leg.id} onClick={() => void recordEvent(leg, WarehouseEventType.OUTBOUND)}>
                <ArrowUpFromLine size={13} /> Xuất kho
              </Button>
            ) : null}
            {state === "INBOUND" || state === "RETURN_INBOUND" ? (
              <Button variant="secondary" className="px-3 py-1.5 text-[11px]" onClick={() => setExpandedId(leg.id)}>
                <ScanLine size={13} /> Kiểm hàng
              </Button>
            ) : null}
            <button type="button" onClick={() => setExpandedId(expanded ? null : leg.id)} aria-label={expanded ? "Thu gọn" : "Xem chi tiết"} className="flex h-8 w-8 items-center justify-center rounded-md text-dt-muted hover:bg-dt-panel">
              <ChevronDown size={16} className={`transition ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
        {expanded ? renderDetail(leg, state) : null}
      </li>
    );
  }

  const tabCards: Array<{ key: Tab; label: string; value: number; hint: string; icon: React.ReactNode; tone: string }> = [
    { key: "inbound", label: "Chờ nhập kho", value: counts.inbound, hint: `${counts.incoming} đơn sắp đến`, icon: <ArrowDownToLine size={16} />, tone: "text-sky-300" },
    { key: "outbound", label: "Chờ xuất kho", value: counts.outbound, hint: `${counts.holding} đơn đang giữ chờ phân công`, icon: <ArrowUpFromLine size={16} />, tone: "text-dt-yellow" },
    { key: "all", label: "Tất cả chặng", value: counts.all, hint: "Gồm cả chặng đã hoàn tất", icon: <Layers size={16} />, tone: "text-dt-text" },
  ];
  const emptyText: Record<Tab, string> = {
    inbound: "Không có kiện nào chờ nhập kho.",
    outbound: "Không có kiện nào sẵn sàng xuất kho.",
    all: "Chưa có chặng nào đi qua kho này.",
  };

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-8 md:py-8">
      <PageHeader
        heading="Vận hành kho"
        subtitle={warehouse ? `${warehouse.code} · ${warehouse.name} · ${warehouse.province}` : "Kiểm hàng khi nhập kho, xuất kho và nhận lại hàng giao thất bại."}
        action={(
          <Button variant="secondary" onClick={() => void loadOperations()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} /> Làm mới
          </Button>
        )}
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-3" role="tablist" aria-label="Nhóm chặng">
        {tabCards.map((card) => {
          const active = tab === card.key;
          return (
            <button
              key={card.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => changeTab(card.key)}
              className={`rounded-dt border p-4 text-left transition ${active ? "border-dt-yellow bg-dt-yellow/5" : "border-dt-border bg-dt-panel hover:border-dt-yellow/40"}`}
            >
              <span className="flex items-center justify-between text-[11px] uppercase tracking-wide text-dt-muted">{card.label}<span className={card.tone}>{card.icon}</span></span>
              <span className={`mt-2 block text-2xl font-semibold ${card.tone}`}>{loading ? "–" : card.value}</span>
              <span className="mt-1 block text-[10px] text-dt-muted">{card.hint}</span>
            </button>
          );
        })}
      </div>

      {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-dt border border-dt-green/30 bg-dt-green/10 px-4 py-3 text-[12px] text-dt-green">{notice}</p> : null}

      <section className="mt-5 rounded-dt border border-dt-border bg-dt-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">{tabCards.find((card) => card.key === tab)?.label} <span className="text-dt-muted">({primary.length})</span></p>
          <label className="flex h-10 w-full items-center gap-2 rounded-dt border border-dt-border bg-dt-panel2 px-3 focus-within:border-dt-yellow sm:w-[300px]">
            <Search size={15} className="text-dt-muted" />
            <input
              value={searchCode}
              onChange={(event) => { setSearchCode(event.target.value); setPage(1); }}
              placeholder="Quét hoặc nhập mã DH..."
              className="min-w-0 flex-1 bg-transparent text-[13px] text-dt-text placeholder:text-dt-muted focus:outline-none"
            />
          </label>
        </div>

        {loading && legs.length === 0 ? <p className="mt-4 text-[12px] text-dt-muted">Đang tải danh sách chặng...</p> : null}
        {!loading && primary.length === 0 ? <p className="mt-4 rounded-md bg-dt-panel2 p-5 text-[12px] text-dt-muted">{searchCode ? "Không tìm thấy mã vận đơn trong nhóm này." : emptyText[tab]}</p> : null}
        {pagedPrimary.length > 0 ? <ul className="mt-4 space-y-2">{pagedPrimary.map(renderRow)}</ul> : null}

        {pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-end gap-2 text-[12px] text-dt-muted">
            <Button variant="secondary" className="px-2.5 py-1.5" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Trang trước"><ChevronLeft size={14} /></Button>
            <span>Trang {currentPage}/{pageCount}</span>
            <Button variant="secondary" className="px-2.5 py-1.5" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Trang sau"><ChevronRight size={14} /></Button>
          </div>
        ) : null}

        {secondary.length > 0 ? (
          <div className="mt-6">
            <p className="text-[11px] uppercase tracking-wide text-dt-muted">{secondaryTitle} ({secondary.length})</p>
            <ul className="mt-2 space-y-2 opacity-80">{secondary.map(renderRow)}</ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
