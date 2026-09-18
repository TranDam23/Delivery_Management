"use client";

import { Navigation, Phone, Route, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ShipmentLegStatusCode } from "@delivery/shared";
import { apiFetch } from "@/lib/api-client";
import { formatVnd, relationValue } from "@/lib/order-ui";
import {
  addressLine,
  customerStop,
  directionsUrl,
  legBucket,
  legTitle,
  sortLegs,
  type AssignedLeg,
} from "./delivery-legs";
import { DeliveryMobileShell } from "./mobile-shell";

function shiftLabel(now: Date): string {
  const hour = now.getHours();
  const shift = hour < 12 ? "Ca sáng" : hour < 18 ? "Ca chiều" : "Ca tối";
  return `${shift} · ${now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
}

function isToday(value: string | null): boolean {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
}

/** Trang chủ shipper: số việc trong ca và việc cần làm tiếp theo, lấy từ chặng thật. */
export function DeliveryHomePage(): React.JSX.Element {
  const [legs, setLegs] = useState<AssignedLeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    apiFetch<AssignedLeg[]>("/api/shipment-routes/my-legs")
      .then((data) => setLegs(sortLegs(data)))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Không tải được chặng"))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => ({
    todo: legs.filter((leg) => legBucket(leg) === "todo").length,
    waiting: legs.filter((leg) => legBucket(leg) === "waiting").length,
    doneToday: legs.filter((leg) => leg.status === ShipmentLegStatusCode.COMPLETED && isToday(leg.completed_at)).length,
    next: legs.find((leg) => legBucket(leg) === "todo") ?? null,
  }), [legs]);

  const next = summary.next;
  const nextOrder = next ? relationValue(next.orders) : null;
  const nextStop = next ? customerStop(next) : null;
  const nextCod = next && !next.is_return && next.leg_type === "LAST_MILE" ? Number(nextOrder?.cod_amount ?? 0) : 0;
  const nextDirections = directionsUrl(nextStop?.address ?? null);
  const nextPhone = nextStop?.address?.phone?.replace(/\s+/g, "");

  return (
    <DeliveryMobileShell active="home" subtitle="Bảng điều khiển giao nhận">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dt-yellow">{now ? shiftLabel(now) : " "}</p>
      <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight">Sẵn sàng giao hàng?</h1>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: "Cần làm", value: summary.todo, tone: "text-dt-yellow" },
          { label: "Chờ kho", value: summary.waiting, tone: "text-sky-300" },
          { label: "Xong hôm nay", value: summary.doneToday, tone: "text-dt-green" },
        ].map((item) => (
          <div key={item.label} className="rounded-dt border border-dt-border bg-dt-panel p-3">
            <p className="text-[11px] text-dt-muted">{item.label}</p>
            <p className={`mt-1.5 text-2xl font-semibold ${item.tone}`}>{loading ? "–" : item.value}</p>
          </div>
        ))}
      </div>

      {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-3 py-2.5 text-[13px] text-red-200">{error}</p> : null}

      <section className="mt-4 rounded-dt border border-dt-yellow/35 bg-dt-panel p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-dt-yellow">Việc tiếp theo</p>
        {loading ? <p className="mt-3 text-[13px] text-dt-muted">Đang tải...</p> : null}
        {!loading && !next ? (
          <div className="mt-3">
            <p className="text-[14px]">Chưa có việc cần làm.</p>
            <p className="mt-1 text-[12px] text-dt-muted">{summary.waiting > 0 ? `${summary.waiting} chặng đang chờ kho xử lý.` : "Khi điều phối viên phân công, chặng sẽ xuất hiện tại đây."}</p>
          </div>
        ) : null}
        {next && nextStop ? (
          <>
            <div className="mt-2 flex items-start justify-between gap-3">
              <p className="font-mono text-[16px] font-semibold">{nextOrder?.tracking_code}</p>
              <span className="rounded-full bg-dt-panel2 px-2 py-0.5 text-[11px] font-semibold">{legTitle(next)}</span>
            </div>
            <div className="mt-3 space-y-1.5 border-t border-dt-border pt-3 text-[13px]">
              <p className="text-dt-muted">{nextStop.role}: <span className="text-dt-text">{nextStop.address?.recipient_name ?? "—"}</span></p>
              <p className="leading-5">{addressLine(nextStop.address)}</p>
              {nextCod > 0 ? <p>Thu COD: <strong className="text-dt-yellow">{formatVnd(nextCod)}</strong></p> : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href="/dashboard/delivery/routes" className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-dt bg-dt-yellow text-[14px] font-semibold text-dt-bg"><Route size={17} /> Mở chặng</Link>
              {nextPhone ? <a href={`tel:${nextPhone}`} className="flex min-h-11 items-center justify-center gap-2 rounded-dt border border-dt-border text-[13px]"><Phone size={16} /> Gọi</a> : <span />}
              {nextDirections ? <a href={nextDirections} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-dt border border-dt-border text-[13px]"><Navigation size={16} /> Chỉ đường</a> : null}
            </div>
          </>
        ) : null}
      </section>

      <div className="mt-4 flex items-start gap-3 rounded-dt border border-dt-border bg-dt-panel2 p-4">
        <Truck className="mt-0.5 shrink-0 text-dt-yellow" size={17} />
        <p className="text-[12px] leading-5 text-dt-muted">Giao thành công phải chụp ảnh minh chứng. Giao thất bại thì mang kiện về kho để nhân viên kho nhận lại trước khi giao lần sau.</p>
      </div>
    </DeliveryMobileShell>
  );
}
