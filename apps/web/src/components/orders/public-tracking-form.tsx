"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PublicTrackingForm(): React.JSX.Element {
  const router = useRouter();
  const [code, setCode] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (normalized) router.push(`/tra-cuu/${encodeURIComponent(normalized)}`);
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="public-tracking-code">Mã vận đơn</label>
      <input id="public-tracking-code" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={40} placeholder="Nhập mã vận đơn, ví dụ DH20260915A1B2C3" className="min-w-0 flex-1 rounded-md border border-dt-border bg-dt-panel2 px-3 py-2.5 text-xs text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none" />
      <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-md bg-dt-yellow px-4 py-2.5 text-xs font-semibold text-dt-bg"><Search size={14} /> Tra cứu</button>
    </form>
  );
}
