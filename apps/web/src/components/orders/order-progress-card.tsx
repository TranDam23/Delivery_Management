import { CheckCircle2, Circle, CircleDot, MapPin, Truck, Warehouse as WarehouseIcon } from "lucide-react";
import { Card, CardLabel } from "@/components/ui/card";
import type { OrderProgress, ProgressLeg, ProgressPhase } from "@/lib/order-progress-types";

const PHASE_LABEL: Record<ProgressPhase, string> = {
  NOT_PICKED_UP: "Chưa lấy hàng",
  PICKING_UP: "Đã lấy hàng, đang đưa về kho",
  AT_WAREHOUSE: "Hàng đang ở kho",
  IN_TRANSIT: "Đang chuyển giữa các kho",
  DELIVERING: "Đang giao đến người nhận",
  DELIVERY_FAILED: "Giao chưa thành công, hàng đang về kho",
  COMPLETED: "Đã hoàn tất",
  CANCELLED: "Đơn đã hủy",
};

const LEG_LABEL = { PICKUP: "Lấy hàng", TRANSFER: "Trung chuyển", LAST_MILE: "Giao hàng" } as const;
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ thực hiện",
  ASSIGNED: "Đã phân công",
  IN_PROGRESS: "Đang thực hiện",
  COMPLETED: "Hoàn tất",
  FAILED: "Chưa thành công",
};

function legTitle(leg: ProgressLeg): string {
  const label = leg.isReturn && leg.type === "LAST_MILE" ? "Trả hàng cho người gửi" : LEG_LABEL[leg.type];
  return `${leg.isReturn ? "Hoàn · " : ""}${label}`;
}

function legRoute(leg: ProgressLeg): string {
  if (leg.type === "PICKUP") return `Người gửi → ${leg.to ?? "kho"}`;
  if (leg.type === "LAST_MILE") return `${leg.from ?? "kho"} → ${leg.isReturn ? "người gửi" : "người nhận"}`;
  return `${leg.from ?? "kho"} → ${leg.to ?? "kho"}`;
}

function staffText(leg: ProgressLeg): string {
  if (leg.staff) return leg.staff;
  return leg.type === "TRANSFER" ? "Nhân viên kho" : "Chưa phân công";
}

function LegIcon({ status }: { status: string }): React.JSX.Element {
  if (status === "COMPLETED") return <CheckCircle2 size={15} className="text-dt-green" />;
  if (status === "IN_PROGRESS") return <CircleDot size={15} className="text-dt-yellow" />;
  return <Circle size={15} className="text-dt-muted" />;
}

/** Kho hiện tại, chặng hiện tại, trạng thái và người phụ trách của đơn; dùng cho người gửi, người nhận và nhân viên. */
export function OrderProgressCard({ progress }: { progress: OrderProgress | null | undefined }): React.JSX.Element | null {
  if (!progress) return null;
  const { currentLeg } = progress;

  return (
    <Card className="gap-4 border-sky-400/25 bg-sky-400/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardLabel>Vị trí và tiến độ vận chuyển</CardLabel>
        <span className="rounded-full bg-sky-400/10 px-3 py-1 text-[11px] font-medium text-sky-300">
          {progress.returning ? "Đang hoàn hàng · " : ""}{PHASE_LABEL[progress.phase]}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-dt border border-dt-border bg-dt-panel2 p-3">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-dt-muted"><WarehouseIcon size={12} /> Kho hiện tại</p>
          <p className="mt-1 text-[13px] font-medium">
            {progress.currentWarehouse
              ? `${progress.currentWarehouse.name}`
              : progress.transit
                ? `Đang trên đường: ${progress.transit.from} → ${progress.transit.to}`
                : progress.phase === "NOT_PICKED_UP"
                  ? "Hàng còn ở người gửi"
                  : progress.phase === "DELIVERING"
                    ? "Đang cùng nhân viên giao hàng"
                    : progress.phase === "PICKING_UP"
                      ? "Đang cùng nhân viên lấy hàng"
                      : progress.phase === "COMPLETED"
                        ? "Đã hoàn tất"
                        : "—"}
          </p>
          {progress.currentWarehouse ? <p className="text-[11px] text-dt-muted">{progress.currentWarehouse.province}</p> : null}
        </div>

        <div className="rounded-dt border border-dt-border bg-dt-panel2 p-3">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-dt-muted"><MapPin size={12} /> {progress.currentLegIsNext ? "Chặng kế tiếp" : "Chặng hiện tại"}</p>
          {currentLeg ? (
            <>
              <p className="mt-1 text-[13px] font-medium">Chặng {currentLeg.sequence}/{progress.legsTotal} · {legTitle(currentLeg)}</p>
              <p className="text-[11px] text-dt-muted">{legRoute(currentLeg)} · {STATUS_LABEL[currentLeg.status] ?? currentLeg.status}{currentLeg.attemptNo > 1 ? ` (lần ${currentLeg.attemptNo})` : ""}</p>
            </>
          ) : <p className="mt-1 text-[13px] font-medium">{progress.phase === "CANCELLED" ? "Đơn đã hủy" : "Đã hoàn tất mọi chặng"}</p>}
        </div>

        <div className="rounded-dt border border-dt-border bg-dt-panel2 p-3">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-dt-muted"><Truck size={12} /> Nhân viên phụ trách</p>
          <p className="mt-1 text-[13px] font-medium">{currentLeg ? staffText(currentLeg) : "—"}</p>
          {currentLeg?.staffNameHidden ? <p className="text-[11px] text-dt-muted">Tên nhân viên chỉ hiển thị với bộ phận điều phối.</p> : null}
        </div>
      </div>

      <div>
        <p className="text-[11px] text-dt-muted">Hoàn tất {progress.legsDone}/{progress.legsTotal} chặng</p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-dt-panel2" aria-hidden="true">
          <div className="h-full rounded-full bg-dt-green" style={{ width: `${progress.legsTotal ? Math.round((progress.legsDone / progress.legsTotal) * 100) : 0}%` }} />
        </div>
        <ol className="mt-3 flex flex-col gap-1.5">
          {progress.legs.map((leg) => (
            <li key={`${leg.isReturn ? "r" : "f"}${leg.sequence}`} className="flex items-start gap-2 text-[11px]">
              <span className="mt-0.5 shrink-0"><LegIcon status={leg.status} /></span>
              <span className={leg.status === "IN_PROGRESS" ? "font-medium text-dt-text" : "text-dt-muted"}>
                {leg.sequence}. {legTitle(leg)} · {legRoute(leg)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
