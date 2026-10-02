"use client";

import { useState } from "react";
import Link from "next/link";
import { TextField } from "@/components/ui/field";
import { guestPost } from "./guest-api";

type FoundOrder = { tracking_code: string; created_at: string; cod_amount: number; cod_status: "pending" | "collected" | "reconciled"; total_fee: number; shipping_fee_payer: "sender" | "receiver" | null; shipping_payment_method: "cash" | "vietqr" | "momo" | null; shipping_payment_status: "pending" | "paid" };

export function GuestOrderLookup(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [items, setItems] = useState<FoundOrder[] | null>(null);
  const [lookupToken, setLookupToken] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    setBusy(true); setError(""); setMessage(""); setItems(null); setLookupToken("");
    try {
      const result = await guestPost<{ message: string }>("/api/guest/otp", { email });
      setMessage(result.message);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không gửi được OTP."); }
    finally { setBusy(false); }
  }

  async function loadPage(nextPage: number, token = lookupToken) {
    setBusy(true); setError("");
    try {
      const result = await guestPost<{ items: FoundOrder[]; lookupToken: string; page: number; pageSize: number; total: number }>("/api/guest/orders/lookup", {
        email, page: nextPage, ...(token ? { lookupToken: token } : { otp }),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      setItems(result.items);
      setLookupToken(result.lookupToken);
      setPage(result.page);
      setTotal(result.total);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Chưa tra được mã vận đơn."); }
    finally { setBusy(false); }
  }

  function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadPage(1);
  }

  return <form onSubmit={lookup} className="space-y-4 rounded-dt border border-dt-border bg-dt-panel p-5">
    <TextField label="Email người gửi đã dùng khi tạo đơn" type="email" required value={email} onChange={(event) => { setEmail(event.target.value); setLookupToken(""); setItems(null); }} />
    <TextField label="Số điện thoại người gửi (không bắt buộc)" hint="Để trống để xem mọi đơn gắn với email đã xác thực; nhập số để lọc bớt." type="tel" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value)} />
    <button type="button" disabled={busy || !email} onClick={sendOtp} className="rounded-md border border-dt-yellow px-4 py-2 text-sm text-dt-yellow disabled:opacity-50">Gửi mã OTP tới email</button>
    <TextField label="Mã OTP" inputMode="numeric" required={!lookupToken} value={otp} onChange={(event) => setOtp(event.target.value)} />
    {message && <p role="status" className="text-xs text-dt-green">{message}</p>}
    {error && <p role="alert" className="text-xs text-dt-red">{error}</p>}
    <button type="submit" disabled={busy || (!otp && !lookupToken)} className="rounded-md bg-dt-yellow px-5 py-3 text-sm font-semibold text-dt-bg disabled:opacity-50">{busy ? "Đang kiểm tra…" : "Xem mã vận đơn"}</button>
    {items && <div className="space-y-2 border-t border-dt-border pt-4">
      <h2 className="text-sm font-semibold">{items.length ? "Các đơn đã tìm thấy" : "Không tìm thấy đơn nào khớp thông tin đã xác thực."}</h2>
      {items.map((item) => <Link key={item.tracking_code} href={`/tra-cuu/${encodeURIComponent(item.tracking_code)}`} className="block rounded border border-dt-border p-3 text-sm text-dt-yellow hover:border-dt-yellow">{item.tracking_code} <span className="ml-2 text-xs text-dt-muted">{new Date(item.created_at).toLocaleDateString("vi-VN")}</span><span className="mt-1 block text-xs text-dt-muted">Phí giao hàng {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(item.total_fee)} · {item.shipping_fee_payer === "sender" ? "Người gửi trả" : item.shipping_fee_payer === "receiver" ? "Người nhận trả" : "Đơn cũ chưa rõ người trả"} · {item.shipping_payment_method === "cash" ? "Tiền mặt" : item.shipping_payment_method === "vietqr" ? "VietQR" : item.shipping_payment_method === "momo" ? "MoMo" : "Chưa rõ phương thức"} · {item.shipping_payment_status === "paid" ? "Đã xác nhận thanh toán" : "Chưa xác nhận thanh toán"}</span>{item.cod_amount > 0 ? <span className="mt-1 block text-xs text-dt-muted">COD {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(item.cod_amount)} · {item.cod_status === "pending" ? "Chưa thu" : item.cod_status === "collected" ? "Đã thu, chờ đối soát" : "Đã đối soát, chưa xác nhận chuyển trả"}</span> : null}</Link>)}
      {total > 20 && <div className="flex items-center justify-between gap-3 pt-2 text-xs text-dt-muted">
        <button type="button" disabled={busy || page <= 1} onClick={() => void loadPage(page - 1)} className="rounded border border-dt-border px-3 py-2 disabled:opacity-40">Trước</button>
        <span>Trang {page}/{Math.ceil(total / 20)} · {total} đơn</span>
        <button type="button" disabled={busy || page * 20 >= total} onClick={() => void loadPage(page + 1)} className="rounded border border-dt-border px-3 py-2 disabled:opacity-40">Sau</button>
      </div>}
    </div>}
  </form>;
}
