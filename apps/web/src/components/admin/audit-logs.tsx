"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/order-ui";

interface AuditItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data: unknown;
  new_data: unknown;
  ip_address: string | null;
  created_at: string;
  users: { full_name: string; email: string } | { full_name: string; email: string }[] | null;
}
interface AuditResult { items: AuditItem[]; total: number; page: number; pageSize: number }

/** Admin xem lịch sử các thao tác quan trọng để kiểm tra và truy vết. */
export function AuditLogsPage(): React.JSX.Element {
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ page: String(page) });
    if (action.trim()) query.set("action", action.trim());
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    try {
      setResult(await apiFetch<AuditResult>(`/api/audit-logs?${query.toString()}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được nhật ký");
    } finally {
      setLoading(false);
    }
  }, [action, from, to, page]);
  useEffect(() => { void load(); }, [load]);

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  return <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-8 md:py-8">
    <PageHeader heading="Nhật ký thao tác (Audit log)" subtitle="Lịch sử các thao tác quan trọng: ai làm gì, lúc nào, dữ liệu trước và sau." action={<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : undefined} /> Làm mới</Button>} />
    <Card className="mt-5">
      <div className="grid gap-3 md:grid-cols-3">
        <TextField label="Hành động" value={action} placeholder="Ví dụ: COD, USER, PAYMENT" onChange={(event) => { setAction(event.target.value); setPage(1); }} />
        <TextField label="Từ ngày" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        <TextField label="Đến ngày" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
      </div>
    </Card>
    {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
    <Card className="mt-4">
      {result && result.items.length === 0 ? <p className="text-[12px] text-dt-muted">Chưa có bản ghi nào.</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-[11px]">
          <thead className="border-b border-dt-border text-[10px] uppercase tracking-wide text-dt-muted">
            <tr><th className="py-2 font-medium">Thời gian</th><th className="py-2 font-medium">Người thực hiện</th><th className="py-2 font-medium">Hành động</th><th className="py-2 font-medium">Đối tượng</th><th className="py-2 font-medium">Thay đổi</th></tr>
          </thead>
          <tbody>
            {result?.items.map((item) => {
              const user = Array.isArray(item.users) ? item.users[0] : item.users;
              return <tr key={item.id} className="border-b border-dt-border/70 align-top last:border-0">
                <td className="py-3 text-dt-muted">{formatDateTime(item.created_at)}</td>
                <td className="py-3">{user ? <><p className="font-medium">{user.full_name}</p><p className="text-[10px] text-dt-muted">{user.email}</p></> : <span className="text-dt-muted">Hệ thống</span>}{item.ip_address ? <p className="text-[10px] text-dt-muted">{item.ip_address}</p> : null}</td>
                <td className="py-3"><span className="rounded-full bg-dt-yellow/10 px-2 py-1 text-[10px] text-dt-yellow">{item.action}</span></td>
                <td className="py-3 text-dt-muted">{item.entity_type}<p className="font-mono text-[10px]">{item.entity_id.slice(0, 8)}</p></td>
                <td className="max-w-[360px] py-3 text-[10px] text-dt-muted">
                  {item.old_data ? <p className="break-all">Trước: {JSON.stringify(item.old_data)}</p> : null}
                  {item.new_data ? <p className="break-all">Sau: {JSON.stringify(item.new_data)}</p> : null}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {result && pages > 1 ? <div className="mt-4 flex items-center justify-end gap-3 text-[11px] text-dt-muted">
        <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</Button>
        <span>Trang {page}/{pages}</span>
        <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={page >= pages} onClick={() => setPage(page + 1)}>Sau</Button>
      </div> : null}
    </Card>
  </div>;
}
