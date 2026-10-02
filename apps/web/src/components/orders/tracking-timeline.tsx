import { CheckCircle2 } from "lucide-react";
import { Card, CardLabel } from "@/components/ui/card";
import { formatDateTime, type TrackingTimelineEntry } from "@/lib/order-ui";

export function TrackingTimeline({ entries }: { entries: TrackingTimelineEntry[] }): React.JSX.Element {
  return (
    <Card>
      <CardLabel>Dòng thời gian hành trình</CardLabel>
      <p className="mt-1 text-[11px] text-dt-muted">{entries.length} mốc đã ghi nhận, bắt đầu từ lúc tạo đơn</p>
      <ol className="mt-5 space-y-0" aria-label="Các mốc hành trình">
        {entries.map((entry, index) => (
          <li key={`${entry.kind}-${entry.time}-${index}`} className="flex gap-3">
            <div className="flex w-5 shrink-0 flex-col items-center">
              <span className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full ${index === entries.length - 1 ? "bg-dt-yellow text-dt-bg" : "border border-dt-green/40 text-dt-green"}`}><CheckCircle2 size={12} /></span>
              {index < entries.length - 1 ? <span className="h-full min-h-8 w-px bg-dt-border" /> : null}
            </div>
            <div className="pb-5">
              <p className="text-[12px] font-medium">{entry.label}</p>
              <p className="mt-1 text-[10px] text-dt-muted">{formatDateTime(entry.time)}{entry.location ? ` · ${entry.location}` : ""}</p>
              <p className="mt-1 text-[10px] text-dt-muted">Thực hiện: {entry.actor}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
