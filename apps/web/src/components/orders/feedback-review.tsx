"use client";

import { useEffect, useState } from "react";
import { Card, CardLabel } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";

interface FeedbackResult {
  order: { trackingCode: string };
  feedback: { id: string; kind: string; rating: number | null; message: string; created_at: string }[];
  alerts: { id: string; status: string; detected_at: string; resolved_at: string | null }[];
}

export function FeedbackReview({ orderId }: { orderId: string }): React.JSX.Element {
  const [data, setData] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    void apiFetch<FeedbackResult>(`/api/orders/feedback/${encodeURIComponent(orderId)}`)
      .then((result) => { if (mounted) setData(result); })
      .catch((cause: unknown) => { if (mounted) setError(cause instanceof Error ? cause.message : "Không tải được phản hồi."); });
    return () => { mounted = false; };
  }, [orderId]);

  return <div className="space-y-4">
    <div><h1 className="text-2xl font-semibold">Phản hồi đơn hàng</h1><p className="mt-1 text-xs text-dt-muted">{data?.order.trackingCode ?? "Đang tải…"}</p></div>
    {error ? <Card><p role="alert" className="text-sm text-dt-red">{error}</p></Card> : null}
    {data?.feedback.length === 0 ? <Card><p className="text-sm text-dt-muted">Đơn hàng chưa có phản hồi.</p></Card> : null}
    {data?.feedback.map((item) => <Card key={item.id}>
      <CardLabel>{item.kind === "COMPLAINT" ? "Phản ánh cần xử lý" : `Đánh giá ${item.rating ?? "—"}/5 sao`}</CardLabel>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.message}</p>
      <p className="text-xs text-dt-muted">Gửi lúc {new Date(item.created_at).toLocaleString("vi-VN")}</p>
      {item.kind === "COMPLAINT" ? <p className="text-xs text-dt-yellow">Trạng thái cảnh báo: {data.alerts[0]?.status ?? "chưa xác định"}</p> : null}
    </Card>)}
  </div>;
}
