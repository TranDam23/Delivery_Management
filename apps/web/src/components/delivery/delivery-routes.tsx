"use client";

import {
  CheckCircle2,
  ChevronDown,
  Navigation,
  PackageCheck,
  Phone,
  RefreshCw,
  ScanLine,
  Truck,
  Warehouse as WarehouseIcon,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockchainEventType, OrderStatusCode, ShipmentLegStatusCode, ShipmentLegType } from "@delivery/shared";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, formatVnd, relationValue } from "@/lib/order-ui";
import { legStatusLabel } from "@/lib/shipment-routing";
import { BottomSheet } from "./bottom-sheet";
import {
  addressLine,
  customerStop,
  directionsUrl,
  hasDeliveryStatus,
  legBucket,
  legTitle,
  legWarehouse,
  sortLegs,
  waitingHint,
  type AssignedLeg,
  type LegBucket,
} from "./delivery-legs";
import { DeliveryMobileShell } from "./mobile-shell";
import { ProofPhotoInput } from "./proof-photo-input";

type DriverEventCode =
  | typeof BlockchainEventType.PICKED_UP
  | typeof BlockchainEventType.PICKUP_FAILED
  | typeof BlockchainEventType.DELIVERING
  | typeof BlockchainEventType.DELIVERED
  | typeof BlockchainEventType.DELIVERY_FAILED;

type SheetKind = "pickup" | "pickupFail" | "deliver" | "deliverFail";

const TABS: Array<{ key: LegBucket; label: string }> = [
  { key: "todo", label: "Cần làm" },
  { key: "waiting", label: "Chờ kho" },
  { key: "done", label: "Đã xong" },
];

const FAILURE_REASONS: Record<"pickupFail" | "deliverFail", string[]> = {
  pickupFail: ["Người gửi vắng nhà", "Hàng chưa đóng gói", "Sai địa chỉ lấy hàng", "Người gửi hủy gửi"],
  deliverFail: ["Không liên lạc được người nhận", "Người nhận hẹn giao lại", "Sai địa chỉ", "Người nhận từ chối nhận"],
};

const SUCCESS_MESSAGES: Record<DriverEventCode, string> = {
  [BlockchainEventType.PICKED_UP]: "Đã xác nhận lấy hàng. Mang kiện về kho để nhân viên kho kiểm và nhập kho.",
  [BlockchainEventType.PICKUP_FAILED]: "Đã báo lấy hàng thất bại, đơn quay lại hàng chờ phân công.",
  [BlockchainEventType.DELIVERING]: "Đã nhận hàng tại kho, bắt đầu giao.",
  [BlockchainEventType.DELIVERED]: "Đã xác nhận giao hàng thành công.",
  [BlockchainEventType.DELIVERY_FAILED]: "Đã ghi nhận giao thất bại. Mang kiện về kho để nhân viên kho nhận lại.",
};

/** Lấy vị trí hiện tại làm minh chứng; không chặn thao tác nếu thiết bị từ chối. */
function currentPosition(): Promise<{ location_lat: number; location_lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ location_lat: position.coords.latitude, location_lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    );
  });
}

function statusTone(status: string): string {
  if (status === ShipmentLegStatusCode.COMPLETED) return "bg-dt-green/10 text-dt-green";
  if (status === ShipmentLegStatusCode.FAILED || status === ShipmentLegStatusCode.CANCELLED) return "bg-dt-red/10 text-red-300";
  if (status === ShipmentLegStatusCode.IN_PROGRESS) return "bg-sky-400/10 text-sky-300";
  return "bg-dt-yellow/10 text-dt-yellow";
}

function lastMileStarted(leg: AssignedLeg): boolean {
  return hasDeliveryStatus(relationValue(leg.deliveries), OrderStatusCode.DELIVERING, leg.started_at);
}

export function DeliveryRoutesPage(): React.JSX.Element {
  const [legs, setLegs] = useState<AssignedLeg[]>([]);
  const [tab, setTab] = useState<LegBucket>("todo");
  const [search, setSearch] = useState("");
  const [scanMode, setScanMode] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [sheet, setSheet] = useState<{ kind: SheetKind; leg: AssignedLeg } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [codCollected, setCodCollected] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadLegs = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setLegs(sortLegs(await apiFetch<AssignedLeg[]>("/api/shipment-routes/my-legs")));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được chặng được phân công");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLegs();
    // "Quét mã" ở thanh điều hướng mở trang với ?scan=1 để đưa con trỏ vào ô mã vận đơn.
    if (new URLSearchParams(window.location.search).get("scan") === "1") {
      setScanMode(true);
      searchRef.current?.focus();
    }
  }, [loadLegs]);

  const counts = useMemo(() => {
    const result: Record<LegBucket, number> = { todo: 0, waiting: 0, done: 0 };
    legs.forEach((leg) => { result[legBucket(leg)] += 1; });
    return result;
  }, [legs]);

  const visibleLegs = useMemo(() => {
    const code = search.trim().toUpperCase();
    // Khi tìm theo mã vận đơn thì tìm trên mọi tab.
    if (code) return legs.filter((leg) => relationValue(leg.orders)?.tracking_code.toUpperCase().includes(code));
    return legs.filter((leg) => legBucket(leg) === tab);
  }, [legs, search, tab]);

  function openSheet(kind: SheetKind, leg: AssignedLeg): void {
    setSheet({ kind, leg });
    setPhotoUrl(null);
    setPhotoUploading(false);
    setReason(null);
    setDetail("");
    setCodCollected(false);
    setSheetError(null);
  }

  const closeSheet = useCallback(() => setSheet(null), []);

  async function submitEvent(
    leg: AssignedLeg,
    statusCode: DriverEventCode,
    extras: { image_url?: string; note?: string; cod_collected?: boolean } = {},
  ): Promise<boolean> {
    const deliveryId = relationValue(leg.deliveries)?.id;
    if (!deliveryId) {
      setError("Chặng chưa có bản ghi giao nhận.");
      return false;
    }
    setBusyId(leg.id);
    setError(null);
    setNotice(null);
    try {
      const position = await currentPosition();
      await apiFetch(`/api/deliveries/${deliveryId}/events`, {
        method: "POST",
        body: JSON.stringify({ status_code: statusCode, ...extras, ...(position ?? {}) }),
      });
      setNotice(leg.is_return && statusCode === BlockchainEventType.DELIVERED
        ? "Đã hoàn hàng thành công cho người gửi."
        : SUCCESS_MESSAGES[statusCode]);
      await loadLegs();
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Không thể cập nhật trạng thái";
      if (sheet) setSheetError(message);
      else setError(message);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSheet(): Promise<void> {
    if (!sheet) return;
    const { kind, leg } = sheet;
    setSheetError(null);
    const order = relationValue(leg.orders);
    const codAmount = Number(order?.cod_amount ?? 0);

    if (kind === "pickupFail" || kind === "deliverFail") {
      const note = [reason, detail.trim()].filter(Boolean).join(": ");
      if (!note) {
        setSheetError("Chọn hoặc nhập lý do thất bại.");
        return;
      }
      const status = kind === "pickupFail" ? BlockchainEventType.PICKUP_FAILED : BlockchainEventType.DELIVERY_FAILED;
      if (await submitEvent(leg, status, { note, image_url: photoUrl ?? undefined })) setSheet(null);
      return;
    }

    if (kind === "deliver") {
      if (!photoUrl) {
        setSheetError("Cần chụp ảnh minh chứng giao hàng.");
        return;
      }
      const needsCod = !leg.is_return && codAmount > 0;
      if (needsCod && !codCollected) {
        setSheetError(`Xác nhận đã thu đủ ${formatVnd(codAmount)} tiền COD.`);
        return;
      }
      if (await submitEvent(leg, BlockchainEventType.DELIVERED, {
        image_url: photoUrl,
        note: detail.trim() || undefined,
        cod_collected: needsCod ? true : undefined,
      })) setSheet(null);
      return;
    }

    if (await submitEvent(leg, BlockchainEventType.PICKED_UP, {
      image_url: photoUrl ?? undefined,
      note: detail.trim() || undefined,
    })) setSheet(null);
  }

  function renderActions(leg: AssignedLeg): React.JSX.Element | null {
    const busy = busyId === leg.id;
    const baseButton = "flex min-h-12 items-center justify-center gap-2 rounded-dt px-3 text-[14px] font-semibold disabled:opacity-50";
    if (!relationValue(leg.deliveries)?.id) return null;

    if (leg.leg_type === ShipmentLegType.PICKUP && leg.status === ShipmentLegStatusCode.ASSIGNED) {
      return (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" disabled={busy} onClick={() => openSheet("pickup", leg)} className={`${baseButton} bg-dt-yellow text-dt-bg`}><PackageCheck size={18} /> Đã lấy hàng</button>
          <button type="button" disabled={busy} onClick={() => openSheet("pickupFail", leg)} className={`${baseButton} border border-dt-border text-red-300`}><XCircle size={18} /> Không lấy được</button>
        </div>
      );
    }
    if (leg.leg_type === ShipmentLegType.LAST_MILE && leg.status === ShipmentLegStatusCode.IN_PROGRESS) {
      if (!lastMileStarted(leg)) {
        return (
          <button type="button" disabled={busy} onClick={() => void submitEvent(leg, BlockchainEventType.DELIVERING)} className={`${baseButton} w-full bg-dt-yellow text-dt-bg`}>
            <Truck size={18} /> {busy ? "Đang cập nhật..." : leg.is_return ? "Nhận hàng & bắt đầu giao hoàn" : "Nhận hàng & bắt đầu giao"}
          </button>
        );
      }
      return (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" disabled={busy} onClick={() => openSheet("deliver", leg)} className={`${baseButton} bg-dt-green text-dt-bg`}><CheckCircle2 size={18} /> {leg.is_return ? "Đã hoàn hàng" : "Giao thành công"}</button>
          <button type="button" disabled={busy} onClick={() => openSheet("deliverFail", leg)} className={`${baseButton} border border-dt-border text-red-300`}><XCircle size={18} /> Thất bại</button>
        </div>
      );
    }
    return null;
  }

  function renderLeg(leg: AssignedLeg): React.JSX.Element {
    const order = relationValue(leg.orders);
    const stop = customerStop(leg);
    const warehouse = legWarehouse(leg);
    const codAmount = Number(order?.cod_amount ?? 0);
    const showCod = codAmount > 0 && !leg.is_return && leg.leg_type === ShipmentLegType.LAST_MILE;
    const hint = waitingHint(leg);
    const expanded = expandedId === leg.id;
    const directions = directionsUrl(stop.address);
    const phone = stop.address?.phone?.replace(/\s+/g, "");
    const inTodo = legBucket(leg) === "todo";

    return (
      <article key={leg.id} className={`rounded-dt border bg-dt-panel ${inTodo ? "border-dt-yellow/40" : "border-dt-border"}`}>
        <button type="button" onClick={() => setExpandedId(expanded ? null : leg.id)} className="flex w-full items-start justify-between gap-3 px-4 pt-4 text-left" aria-expanded={expanded}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${leg.is_return ? "bg-orange-400/15 text-orange-300" : "bg-dt-panel2 text-dt-text"}`}>{legTitle(leg)}</span>
              {leg.attempt_no > 1 ? <span className="text-[11px] text-dt-muted">Lần {leg.attempt_no}</span> : null}
            </div>
            <p className="mt-2 font-mono text-[15px] font-semibold text-dt-yellow">{order?.tracking_code ?? "—"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`rounded-full px-2 py-1 text-[11px] ${statusTone(leg.status)}`}>{legStatusLabel(leg.status)}</span>
            <ChevronDown size={16} className={`text-dt-muted transition ${expanded ? "rotate-180" : ""}`} />
          </div>
        </button>

        <div className="px-4 pb-4 pt-3">
          <p className="text-[12px] text-dt-muted">{stop.role}</p>
          <p className="mt-0.5 text-[14px] font-medium">{stop.address?.recipient_name ?? "—"}</p>
          <p className="mt-1 text-[13px] leading-5 text-dt-text/90">{addressLine(stop.address)}</p>
          {showCod ? <p className="mt-2 inline-flex rounded-md bg-dt-yellow/10 px-2 py-1 text-[13px]">Thu COD: <strong className="ml-1 text-dt-yellow">{formatVnd(codAmount)}</strong></p> : null}

          {inTodo || expanded ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {phone ? <a href={`tel:${phone}`} className="flex min-h-11 items-center justify-center gap-2 rounded-dt border border-dt-border text-[13px]"><Phone size={16} /> Gọi {stop.address?.phone}</a> : <span />}
              {directions ? <a href={directions} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-dt border border-dt-border text-[13px]"><Navigation size={16} /> Chỉ đường</a> : null}
            </div>
          ) : null}

          {hint ? <p className="mt-3 rounded-md border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-[12px] leading-5 text-sky-100">{hint}</p> : null}

          {expanded ? (
            <div className="mt-3 space-y-2 rounded-md bg-dt-panel2 p-3 text-[12px] leading-5 text-dt-muted">
              {warehouse ? <p className="flex items-start gap-2"><WarehouseIcon size={14} className="mt-0.5 shrink-0 text-dt-yellow" />Kho: {warehouse.code} · {warehouse.name}</p> : null}
              {order?.note ? <p>Lưu ý của khách: <span className="text-dt-text">{order.note}</span></p> : null}
              <p>Chặng {leg.sequence_no} · cập nhật {formatDateTime(leg.updated_at)}</p>
            </div>
          ) : null}

          {renderActions(leg) ? <div className="mt-3">{renderActions(leg)}</div> : null}
        </div>
      </article>
    );
  }

  function renderSheet(): React.JSX.Element | null {
    if (!sheet) return null;
    const { kind, leg } = sheet;
    const order = relationValue(leg.orders);
    const codAmount = Number(order?.cod_amount ?? 0);
    const needsCod = kind === "deliver" && !leg.is_return && codAmount > 0;
    const isFailure = kind === "pickupFail" || kind === "deliverFail";
    const titles: Record<SheetKind, string> = {
      pickup: "Xác nhận đã lấy hàng",
      pickupFail: "Không lấy được hàng",
      deliver: leg.is_return ? "Xác nhận đã hoàn hàng" : "Xác nhận giao thành công",
      deliverFail: "Giao hàng thất bại",
    };
    const busy = busyId === leg.id;

    return (
      <BottomSheet
        open
        title={titles[kind]}
        onClose={closeSheet}
        footer={(
          <button
            type="button"
            disabled={busy || photoUploading}
            onClick={() => void confirmSheet()}
            className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-dt text-[15px] font-semibold disabled:opacity-50 ${isFailure ? "bg-dt-red text-white" : "bg-dt-yellow text-dt-bg"}`}
          >
            {busy ? "Đang gửi..." : photoUploading ? "Đợi tải ảnh xong..." : isFailure ? "Báo thất bại" : "Xác nhận"}
          </button>
        )}
      >
        <p className="font-mono text-[14px] font-semibold text-dt-yellow">{order?.tracking_code}</p>
        <p className="mt-1 text-[12px] text-dt-muted">{addressLine(customerStop(leg).address)}</p>

        <div className="mt-4 space-y-4">
          {isFailure ? (
            <div>
              <p className="mb-2 text-[12px] font-medium">Lý do <span className="text-dt-yellow">*</span></p>
              <div className="flex flex-wrap gap-2">
                {FAILURE_REASONS[kind].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setReason(reason === item ? null : item)}
                    className={`min-h-10 rounded-full border px-3 text-[13px] ${reason === item ? "border-dt-yellow bg-dt-yellow/15 text-dt-yellow" : "border-dt-border text-dt-text"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <ProofPhotoInput
            label={kind === "deliver" ? "Ảnh minh chứng giao hàng" : "Ảnh minh chứng (không bắt buộc)"}
            required={kind === "deliver"}
            value={photoUrl}
            onChange={setPhotoUrl}
            onUploadingChange={setPhotoUploading}
          />

          {needsCod ? (
            <label className="flex min-h-12 items-center gap-3 rounded-dt border border-dt-yellow/40 bg-dt-yellow/5 px-3 text-[14px]">
              <input type="checkbox" className="h-5 w-5 accent-dt-yellow" checked={codCollected} onChange={(event) => setCodCollected(event.target.checked)} />
              Đã thu đủ <strong className="text-dt-yellow">{formatVnd(codAmount)}</strong>
            </label>
          ) : null}

          <label className="block">
            <span className="mb-2 block text-[12px] font-medium">{isFailure ? "Mô tả thêm" : "Ghi chú (không bắt buộc)"}</span>
            <textarea
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              rows={2}
              maxLength={300}
              placeholder={isFailure ? "Ví dụ: gọi 3 lần không nghe máy" : "Ví dụ: gửi bảo vệ tòa nhà"}
              className="w-full rounded-dt border border-dt-border bg-dt-panel2 px-3 py-2 text-[14px] text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none"
            />
          </label>

          {sheetError ? <p role="alert" className="rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[13px] text-red-200">{sheetError}</p> : null}
        </div>
      </BottomSheet>
    );
  }

  return (
    <DeliveryMobileShell
      active={scanMode ? "scan" : "routes"}
      subtitle="Chặng giao nhận của tôi"
      action={(
        <button type="button" onClick={() => void loadLegs()} disabled={loading} aria-label="Làm mới" className="flex h-10 w-10 items-center justify-center rounded-full text-dt-muted hover:bg-dt-panel2 hover:text-dt-text">
          <RefreshCw size={17} className={loading ? "animate-spin" : undefined} />
        </button>
      )}
    >
      <label className="flex min-h-12 items-center gap-2 rounded-dt border border-dt-border bg-dt-panel px-3 focus-within:border-dt-yellow">
        <ScanLine size={18} className="shrink-0 text-dt-yellow" />
        <input
          ref={searchRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Quét hoặc nhập mã DH..."
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-dt-text placeholder:text-dt-muted focus:outline-none"
        />
        {search ? <button type="button" onClick={() => setSearch("")} className="px-1 text-[13px] text-dt-muted">Xóa</button> : null}
      </label>

      {!search ? (
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-dt bg-dt-panel p-1" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-md text-[13px] ${tab === item.key ? "bg-dt-yellow font-semibold text-dt-bg" : "text-dt-muted"}`}
            >
              {item.label}
              <span className={`min-w-5 rounded-full px-1.5 text-[11px] ${tab === item.key ? "bg-dt-bg/20" : "bg-dt-panel2"}`}>{counts[item.key]}</span>
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-3 rounded-dt border border-dt-red/40 bg-dt-red/10 px-3 py-2.5 text-[13px] text-red-200">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-dt border border-dt-green/30 bg-dt-green/10 px-3 py-2.5 text-[13px] text-dt-green">{notice}</p> : null}

      <div className="mt-3 space-y-3">
        {loading && legs.length === 0 ? <p className="rounded-dt bg-dt-panel p-4 text-[13px] text-dt-muted">Đang tải chặng được phân công...</p> : null}
        {!loading && visibleLegs.length === 0 ? (
          <div className="rounded-dt border border-dt-border bg-dt-panel p-5 text-center">
            <p className="text-[14px]">{search ? "Không tìm thấy mã vận đơn này trong chặng của bạn." : tab === "todo" ? "Không có việc cần làm." : tab === "waiting" ? "Không có chặng nào đang chờ kho." : "Chưa có chặng hoàn tất."}</p>
            {!search && tab === "todo" ? <p className="mt-1 text-[12px] text-dt-muted">Khi điều phối viên phân công, chặng sẽ xuất hiện tại đây.</p> : null}
          </div>
        ) : null}
        {visibleLegs.map(renderLeg)}
      </div>

      {renderSheet()}
    </DeliveryMobileShell>
  );
}
