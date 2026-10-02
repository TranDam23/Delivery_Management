"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch, apiUpload } from "@/lib/api-client";
import { BANKS } from "@/lib/banks";
import type { PaymentAccount, PaymentAccountKind } from "@/lib/payment-accounts";

const KIND_LABEL: Record<PaymentAccountKind, string> = { bank: "Ngân hàng (VietQR)", momo: "Ví MoMo" };

/** Admin cấu hình nơi nhận phí vận chuyển: mỗi loại chỉ một tài khoản đang bật. */
export function PaymentAccountsManager(): React.JSX.Element {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<PaymentAccountKind>("bank");
  const [bankBin, setBankBin] = useState(BANKS[0]?.bin ?? "");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");
  const [activate, setActivate] = useState(true);
  const [qrFile, setQrFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await apiFetch<PaymentAccount[]>("/api/payment-accounts"));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được danh sách tài khoản");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thực hiện được");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    await run(async () => {
      let qrImageUrl: string | undefined;
      if (kind === "momo") {
        if (!qrFile) throw new Error("Tải lên ảnh mã QR nhận tiền lấy từ app MoMo");
        const form = new FormData();
        form.append("file", qrFile);
        form.append("purpose", "payment_qr");
        qrImageUrl = (await apiUpload<{ url: string }>("/api/uploads/images", form)).url;
      }
      await apiFetch("/api/payment-accounts", {
        method: "POST",
        body: JSON.stringify({ kind, bank_bin: kind === "bank" ? bankBin : undefined, account_name: accountName, account_number: accountNumber, qr_image_url: qrImageUrl, note: note || undefined, activate }),
      });
      setAccountName("");
      setAccountNumber("");
      setNote("");
      setQrFile(null);
    }, "Đã lưu tài khoản nhận tiền.");
  }

  return <div className="space-y-4">
    <Card>
      <CardLabel>Thêm tài khoản nhận phí vận chuyển</CardLabel>
      <form onSubmit={(event) => void submit(event)} className="grid gap-3 text-[12px] md:grid-cols-2">
        <SelectField label="Loại" value={kind} onChange={(event) => setKind(event.target.value as PaymentAccountKind)}>
          <option value="bank">Ngân hàng — QR VietQR sinh tự động theo số tiền</option>
          <option value="momo">Ví MoMo — dùng ảnh mã nhận tiền</option>
        </SelectField>
        {kind === "bank" ? <SelectField label="Ngân hàng" value={bankBin} onChange={(event) => setBankBin(event.target.value)}>
          {BANKS.map((bank) => <option key={bank.bin} value={bank.bin}>{bank.name}</option>)}
        </SelectField> : <TextField label="Ảnh mã QR nhận tiền (từ app MoMo)" type="file" accept="image/*" required onChange={(event) => setQrFile(event.target.files?.[0] ?? null)} />}
        <TextField label="Tên chủ tài khoản" required value={accountName} onChange={(event) => setAccountName(event.target.value)} hint="Hệ thống tự chuyển thành chữ HOA không dấu như trên app ngân hàng." />
        <TextField label={kind === "bank" ? "Số tài khoản" : "Số điện thoại MoMo"} required inputMode="numeric" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} />
        <TextField label="Ghi chú (không bắt buộc)" value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
        <label className="flex items-center gap-2 self-end pb-2 text-dt-muted"><input type="checkbox" checked={activate} onChange={(event) => setActivate(event.target.checked)} /> Dùng ngay làm nơi nhận tiền (thay tài khoản cùng loại đang bật)</label>
        <div className="md:col-span-2"><Button type="submit" disabled={busy}>Lưu tài khoản</Button></div>
      </form>
      {notice ? <p className="mt-3 text-[12px] text-dt-green">{notice}</p> : null}
      {error ? <p className="mt-3 text-[12px] text-dt-red">{error}</p> : null}
    </Card>
    <Card>
      <CardLabel>Tài khoản đã cấu hình</CardLabel>
      <p className="mb-3 text-[11px] text-dt-muted">Đơn mới chụp lại tài khoản đang bật lúc tạo đơn, nên đổi tài khoản không làm QR của đơn cũ trỏ sai chỗ. Chưa bật tài khoản nào thì khách chỉ chọn được tiền mặt.</p>
      {loading ? <p className="text-[12px] text-dt-muted">Đang tải…</p> : accounts.length === 0 ? <p className="text-[12px] text-dt-muted">Chưa có tài khoản nào.</p> : <ul className="space-y-2">
        {accounts.map((account) => <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dt-border p-3 text-[12px]">
          <div>
            <p className="font-medium">{KIND_LABEL[account.kind]} · {account.bank_name} {account.is_active ? <span className="ml-2 rounded-full bg-dt-green/10 px-2 py-0.5 text-[10px] text-dt-green">Đang dùng</span> : null}</p>
            <p className="text-dt-muted">{account.account_number} · {account.account_name}{account.note ? ` · ${account.note}` : ""}</p>
            {account.kind === "momo" && account.qr_image_url ? <a href={account.qr_image_url} target="_blank" rel="noreferrer" className="text-dt-yellow underline">Xem ảnh QR</a> : null}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => apiFetch(`/api/payment-accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !account.is_active }) }), account.is_active ? "Đã tắt nhận tiền." : "Đã bật nhận tiền.")}>{account.is_active ? "Tắt" : "Dùng"}</Button>
            <Button variant="danger" disabled={busy} onClick={() => { if (window.confirm("Xóa tài khoản này? Đơn cũ vẫn giữ thông tin đã chụp.")) void run(() => apiFetch(`/api/payment-accounts/${account.id}`, { method: "DELETE" }), "Đã xóa tài khoản."); }}>Xóa</Button>
          </div>
        </li>)}
      </ul>}
    </Card>
  </div>;
}
