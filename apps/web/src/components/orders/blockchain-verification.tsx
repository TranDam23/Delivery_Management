"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

interface VerificationResult {
  matched: boolean;
  confirmedCount: number;
  pendingCount: number;
  failedCount: number;
}

export function BlockchainVerification({ trackingCode }: { trackingCode: string }): React.JSX.Element {
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function verify(): Promise<void> {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await apiFetch<VerificationResult>(`/api/blockchain/verify/${encodeURIComponent(trackingCode)}`));
    } catch {
      setError("Chưa thể đối chiếu Blockchain lúc này. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <Button type="button" onClick={() => void verify()} disabled={loading}><ShieldCheck size={14} /> {loading ? "Đang đối chiếu..." : "Đối chiếu Blockchain"}</Button>
      {error ? <p role="alert" className="text-[11px] text-dt-red">{error}</p> : null}
      {result ? (
        <p role="status" className={`text-[11px] ${result.matched ? "text-dt-green" : "text-dt-muted"}`}>
          {result.confirmedCount === 0 ? "Chưa có sự kiện được xác nhận trên Blockchain."
            : result.matched ? `Đã đối chiếu thành công ${result.confirmedCount} sự kiện.`
              : `Chưa đối chiếu khớp toàn bộ ${result.confirmedCount} sự kiện đã xác nhận.`}
          {result.pendingCount > 0 ? ` ${result.pendingCount} sự kiện đang chờ xác nhận.` : ""}
          {result.failedCount > 0 ? ` ${result.failedCount} sự kiện ghi chuỗi thất bại.` : ""}
        </p>
      ) : null}
    </div>
  );
}
