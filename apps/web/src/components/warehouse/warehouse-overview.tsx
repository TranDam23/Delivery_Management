"use client";

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Boxes,
  Clock3,
  PackageX,
  RefreshCw,
  Truck,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageCondition, ShipmentLegType, WarehouseEventType, WarehouseLevelCode, type Warehouse } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, relationValue } from "@/lib/order-ui";
import {
  ACTIONABLE_STATES,
  computeLegStates,
  itemSummary,
  type LegState,
  type WarehouseEvent,
  type WarehouseOperationLeg,
  type WarehouseOperationsResponse,
} from "./warehouse-legs";

const OPERATIONS_HREF = "/dashboard/warehouse/operations";
/** Chờ quá ngưỡng này thì gắn cảnh báo trong danh sách việc chờ. */
const LONG_WAIT_HOURS = 12;
const CHART_DAYS = 7;
/** Màu dãy số liệu, đã kiểm tra độ tương phản và mù màu trên nền panel tối. */
const SERIES = {
  inbound: { label: "Nhập kho", color: "#0284c7" },
  outbound: { label: "Xuất kho", color: "#b8860b" },
} as const;

interface EventWithLeg extends WarehouseEvent {
  leg: WarehouseOperationLeg;
}

interface DayBucket {
  key: string;
  label: string;
  fullLabel: string;
  inbound: number;
  outbound: number;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function waitLabel(fromIso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(fromIso)) / 60000));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  return `${Math.floor(hours / 24)} ngày ${hours % 24} giờ`;
}

function levelLabel(level: string | undefined): string {
  if (level === WarehouseLevelCode.REGIONAL) return "Trung tâm khai thác vùng";
  if (level === WarehouseLevelCode.PROVINCE) return "Kho cấp tỉnh";
  return "Kho phường/xã";
}

const STATE_TEXT: Record<LegState, string> = {
  INBOUND: "Chờ nhập kho",
  RETURN_INBOUND: "Chờ nhận lại hàng",
  OUTBOUND: "Chờ xuất kho",
  HOLDING: "Chờ phân công shipper",
  INCOMING: "Sắp đến",
  OTHER: "",
};

function tabForState(state: LegState): string {
  return state === "OUTBOUND" || state === "HOLDING" ? "outbound" : "inbound";
}

/** Biểu đồ cột đôi nhập/xuất theo ngày, có chú thích, tooltip khi rê chuột và bảng cho trình đọc màn hình. */
function ActivityChart({ days }: { days: DayBucket[] }): React.JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...days.flatMap((day) => [day.inbound, day.outbound]));
  const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
  const hoveredDay = days.find((day) => day.key === hovered) ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-dt-muted">
        {Object.values(SERIES).map((series) => (
          <span key={series.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series.color }} aria-hidden />
            {series.label}
          </span>
        ))}
        <span className="ml-auto h-4 text-dt-text">
          {hoveredDay ? `${hoveredDay.fullLabel}: nhập ${hoveredDay.inbound} · xuất ${hoveredDay.outbound}` : ""}
        </span>
      </div>

      <div className="relative mt-3 h-44" aria-hidden>
        {[1, 0.5, 0].map((ratio) => (
          <div key={ratio} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${ratio * 100}%` }}>
            <span className="w-5 text-right text-[10px] text-dt-muted">{Math.round(ceiling * ratio)}</span>
            <span className={`h-px flex-1 ${ratio === 0 ? "bg-dt-border" : "bg-dt-border/40"}`} />
          </div>
        ))}
        <div className="absolute inset-y-0 left-7 right-0 flex items-end">
          {days.map((day) => (
            <div
              key={day.key}
              onMouseEnter={() => setHovered(day.key)}
              onMouseLeave={() => setHovered(null)}
              className={`flex h-full flex-1 items-end justify-center gap-0.5 rounded-t-md ${hovered === day.key ? "bg-white/[0.04]" : ""}`}
            >
              {(["inbound", "outbound"] as const).map((series) => (
                <span
                  key={series}
                  className="w-3 rounded-t sm:w-4"
                  style={{
                    height: `${(day[series] / ceiling) * 100}%`,
                    minHeight: day[series] > 0 ? 2 : 0,
                    backgroundColor: SERIES[series].color,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="ml-7 mt-1.5 flex text-[10px] text-dt-muted" aria-hidden>
        {days.map((day) => <span key={day.key} className="flex-1 text-center">{day.label}</span>)}
      </div>

      <table className="sr-only">
        <caption>Số lượt nhập kho và xuất kho {CHART_DAYS} ngày gần nhất</caption>
        <thead><tr><th>Ngày</th><th>Nhập kho</th><th>Xuất kho</th></tr></thead>
        <tbody>{days.map((day) => <tr key={day.key}><td>{day.fullLabel}</td><td>{day.inbound}</td><td>{day.outbound}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Trang tổng quan của nhân viên kho: việc tồn đọng, hoạt động trong ngày và 7 ngày gần nhất. */
export function WarehouseOverviewPage(): React.JSX.Element {
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [legs, setLegs] = useState<WarehouseOperationLeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<WarehouseOperationsResponse>("/api/warehouse-operations");
      setWarehouse(result.warehouse);
      setLegs(result.legs);
      setNow(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được dữ liệu kho");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const states = useMemo(() => computeLegStates(legs, warehouse?.id), [legs, warehouse?.id]);
  const stateOf = useCallback((leg: WarehouseOperationLeg): LegState => states.get(leg.id) ?? "OTHER", [states]);

  const summary = useMemo(() => {
    const count = (list: LegState[]) => legs.filter((leg) => list.includes(stateOf(leg))).length;
    return {
      inbound: count(["INBOUND", "RETURN_INBOUND"]),
      outbound: count(["OUTBOUND"]),
      // Hàng đã nhập và đang nằm trong kho: sẵn sàng xuất hoặc chờ phân công shipper.
      held: count(["OUTBOUND", "HOLDING"]),
      holding: count(["HOLDING"]),
      incoming: count(["INCOMING"]),
    };
  }, [legs, stateOf]);

  const events = useMemo<EventWithLeg[]>(() => legs
    .flatMap((leg) => leg.warehouse_events.map((event) => ({ ...event, leg })))
    .sort((a, b) => b.event_time.localeCompare(a.event_time)), [legs]);

  const today = useMemo(() => {
    const key = now ? dayKey(new Date(now)) : "";
    const todays = events.filter((event) => dayKey(new Date(event.event_time)) === key);
    const isReturnIntake = (event: EventWithLeg) =>
      event.event_type === WarehouseEventType.INBOUND && event.leg.leg_type === ShipmentLegType.LAST_MILE;
    return {
      inbound: todays.filter((event) => event.event_type === WarehouseEventType.INBOUND && !isReturnIntake(event)).length,
      outbound: todays.filter((event) => event.event_type === WarehouseEventType.OUTBOUND).length,
      returned: todays.filter(isReturnIntake).length,
      damaged: todays.filter((event) => event.package_condition === PackageCondition.DAMAGED).length,
    };
  }, [events, now]);

  const days = useMemo<DayBucket[]>(() => {
    if (!now) return [];
    const buckets: DayBucket[] = [];
    for (let offset = CHART_DAYS - 1; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      buckets.push({
        key: dayKey(date),
        label: offset === 0 ? "Hôm nay" : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
        fullLabel: date.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }),
        inbound: 0,
        outbound: 0,
      });
    }
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    for (const event of events) {
      const bucket = byKey.get(dayKey(new Date(event.event_time)));
      if (!bucket) continue;
      if (event.event_type === WarehouseEventType.INBOUND) bucket.inbound += 1;
      else bucket.outbound += 1;
    }
    return buckets;
  }, [events, now]);

  const waiting = useMemo(() => legs
    .filter((leg) => ACTIONABLE_STATES.includes(stateOf(leg)) || stateOf(leg) === "HOLDING")
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    .slice(0, 6), [legs, stateOf]);
  const longWaitCount = legs.filter((leg) =>
    (ACTIONABLE_STATES.includes(stateOf(leg)) || stateOf(leg) === "HOLDING")
    && now - Date.parse(leg.updated_at) > LONG_WAIT_HOURS * 3600_000).length;

  const kpis = [
    { label: "Chờ nhập kho", value: summary.inbound, hint: "Kiện đã tới, cần kiểm và nhập", tab: "inbound", icon: ArrowDownToLine, tone: "text-sky-300" },
    { label: "Chờ xuất kho", value: summary.outbound, hint: "Sẵn sàng chuyển tiếp", tab: "outbound", icon: ArrowUpFromLine, tone: "text-dt-yellow" },
    { label: "Đang giữ tại kho", value: summary.held, hint: `${summary.holding} kiện chờ phân công shipper`, tab: "outbound", icon: Boxes, tone: "text-dt-text" },
    { label: "Sắp đến", value: summary.incoming, hint: "Chưa rời kho gửi / chưa lấy hàng", tab: "inbound", icon: Truck, tone: "text-dt-muted" },
  ];
  const todayStats = [
    { label: "Lượt nhập kho", value: today.inbound, icon: ArrowDownToLine, tone: "text-sky-300" },
    { label: "Lượt xuất kho", value: today.outbound, icon: ArrowUpFromLine, tone: "text-dt-yellow" },
    { label: "Nhận lại hàng giao thất bại", value: today.returned, icon: Undo2, tone: "text-orange-300" },
    { label: "Kiện hư hỏng", value: today.damaged, icon: PackageX, tone: today.damaged > 0 ? "text-red-300" : "text-dt-muted" },
  ];

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-8 md:py-8">
      <PageHeader
        heading="Tổng quan kho"
        subtitle={warehouse ? `${warehouse.code} · ${warehouse.name} · ${levelLabel(warehouse.warehouse_level)} · ${warehouse.province}` : "Tình hình hàng hóa tại kho được phân công."}
        action={(
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()} disabled={loading} aria-label="Làm mới">
              <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
            </Button>
            <Link href={OPERATIONS_HREF} className={buttonClassName("primary")}>Vận hành kho <ArrowRight size={14} /></Link>
          </div>
        )}
      />

      {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}

      {longWaitCount > 0 ? (
        <Link href={`${OPERATIONS_HREF}?tab=inbound`} className="mt-5 flex items-center gap-3 rounded-dt border border-orange-400/40 bg-orange-400/10 px-4 py-3 text-[12px] text-orange-200">
          <AlertTriangle size={16} className="shrink-0" />
          <span><strong>{longWaitCount} kiện</strong> đã chờ xử lý quá {LONG_WAIT_HOURS} giờ. Xem danh sách bên dưới hoặc mở trang vận hành.</span>
        </Link>
      ) : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.label} href={`${OPERATIONS_HREF}?tab=${kpi.tab}`} className="rounded-dt border border-dt-border bg-dt-panel p-4 transition hover:border-dt-yellow/40">
              <span className="flex items-center justify-between text-[11px] uppercase tracking-wide text-dt-muted">{kpi.label}<Icon size={16} className={kpi.tone} /></span>
              <span className={`mt-2 block text-3xl font-semibold ${kpi.tone}`}>{loading ? "–" : kpi.value}</span>
              <span className="mt-1 block text-[10px] text-dt-muted">{kpi.hint}</span>
            </Link>
          );
        })}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-dt border border-dt-border bg-dt-panel p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Hoạt động hôm nay</p>
            <p className="text-[11px] text-dt-muted">{now ? new Date(now).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }) : ""}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {todayStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-md bg-dt-panel2 p-3">
                  <Icon size={15} className={stat.tone} />
                  <p className="mt-2 text-xl font-semibold">{loading ? "–" : stat.value}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-dt-muted">{stat.label}</p>
                </div>
              );
            })}
          </div>

          <p className="mt-6 text-sm font-semibold">Nhập / xuất {CHART_DAYS} ngày gần nhất</p>
          <div className="mt-3">{days.length > 0 ? <ActivityChart days={days} /> : <p className="text-[12px] text-dt-muted">Đang tải...</p>}</div>
        </div>

        <div className="rounded-dt border border-dt-border bg-dt-panel p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Việc chờ lâu nhất</p>
            <Link href={OPERATIONS_HREF} className="text-[11px] text-dt-yellow hover:underline">Xem tất cả</Link>
          </div>
          {!loading && waiting.length === 0 ? <p className="mt-4 rounded-md bg-dt-panel2 p-4 text-[12px] text-dt-muted">Không có kiện nào đang chờ xử lý.</p> : null}
          <ul className="mt-3 space-y-2">
            {waiting.map((leg) => {
              const state = stateOf(leg);
              const overdue = now - Date.parse(leg.updated_at) > LONG_WAIT_HOURS * 3600_000;
              return (
                <li key={leg.id}>
                  <Link href={`${OPERATIONS_HREF}?tab=${tabForState(state)}`} className="flex items-center gap-3 rounded-md bg-dt-panel2 px-3 py-2.5 hover:bg-white/[0.04]">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[12px] font-semibold text-dt-yellow">{relationValue(leg.orders)?.tracking_code}</span>
                      <span className="block truncate text-[11px] text-dt-text">{itemSummary(relationValue(leg.orders))}</span>
                      <span className="block text-[10px] text-dt-muted">{STATE_TEXT[state]}</span>
                    </span>
                    <span className={`flex shrink-0 items-center gap-1 text-[11px] ${overdue ? "text-orange-300" : "text-dt-muted"}`}>
                      {overdue ? <AlertTriangle size={12} aria-label="Chờ quá lâu" /> : <Clock3 size={12} />}
                      {waitLabel(leg.updated_at, now)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="mt-5 rounded-dt border border-dt-border bg-dt-panel p-5">
        <p className="text-sm font-semibold">Hoạt động gần đây</p>
        {!loading && events.length === 0 ? <p className="mt-3 text-[12px] text-dt-muted">Kho chưa có thao tác nhập/xuất nào.</p> : null}
        <ul className="mt-3 divide-y divide-dt-border">
          {events.slice(0, 10).map((event) => {
            const isInbound = event.event_type === WarehouseEventType.INBOUND;
            const isReturnIntake = isInbound && event.leg.leg_type === ShipmentLegType.LAST_MILE;
            const performer = relationValue(event.performer ?? null)?.full_name;
            return (
              <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[12px]">
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${isInbound ? "bg-sky-400/10 text-sky-300" : "bg-dt-yellow/10 text-dt-yellow"}`}>
                  {isReturnIntake ? <Undo2 size={14} /> : isInbound ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />}
                </span>
                <span className="font-medium">{isReturnIntake ? "Nhận lại hàng" : isInbound ? "Nhập kho" : "Xuất kho"}</span>
                <span className="font-mono text-dt-yellow">{relationValue(event.leg.orders)?.tracking_code}</span>
                {event.package_condition === PackageCondition.DAMAGED ? <span className="flex items-center gap-1 text-red-300"><PackageX size={12} /> Hư hỏng</span> : null}
                <span className="text-dt-muted">{performer ? `bởi ${performer}` : ""}</span>
                <span className="ml-auto text-[11px] text-dt-muted">{formatDateTime(event.event_time)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
