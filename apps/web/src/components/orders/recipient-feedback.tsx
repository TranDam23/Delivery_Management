"use client";

import { useState } from "react";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { guestPost } from "@/components/guest/guest-api";

export function RecipientFeedback({ trackingCode }: { trackingCode: string }): React.JSX.Element {
  const [kind, setKind] = useState<"REVIEW" | "COMPLAINT">("REVIEW");
  const [rating, setRating] = useState("5");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);

  async function sendOtp() {
    setError(""); setNotice(""); setBusy(true);
    try {
      const result = await guestPost<{ message: string }>("/api/guest/otp", { email });
      setNotice(result.message);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không gửi được OTP."); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      const result = await guestPost<{ id: string; message: string }>("/api/orders/feedback", {
        trackingCode, email, otp, kind, rating: kind === "REVIEW" ? Number(rating) : null, message,
      });
      setNotice(result.message); setDone(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không gửi được phản hồi."); }
    finally { setBusy(false); }
  }

  return <Card className="max-w-[760px]">
    <CardLabel>Đánh giá hoặc phản ánh sau giao hàng</CardLabel>
    <p className="text-[12px] leading-5 text-dt-muted">Đơn đã được đánh dấu giao thành công khi shipper gửi ảnh minh chứng. Người nhận không cần xác nhận thêm. Nếu có vấn đề, bạn có thể gửi phản ánh để điều phối viên xử lý.</p>
    {done ? <p role="status" className="text-sm text-dt-green">{notice}</p> : <form onSubmit={submit} className="space-y-4">
      <SelectField label="Loại phản hồi" value={kind} onChange={(event) => setKind(event.target.value as "REVIEW" | "COMPLAINT")}>
        <option value="REVIEW">Đánh giá</option><option value="COMPLAINT">Phản ánh cần giải quyết</option>
      </SelectField>
      {kind === "REVIEW" ? <SelectField label="Mức độ hài lòng" value={rating} onChange={(event) => setRating(event.target.value)}>
        {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} sao</option>)}
      </SelectField> : null}
      <label className="flex flex-col gap-[6px]"><span className="text-[11px] font-medium text-dt-muted">Nội dung *</span>
        <textarea required minLength={10} maxLength={2000} rows={4} value={message} onChange={(event) => setMessage(event.target.value)}
          className="w-full rounded-dt border border-dt-border bg-dt-panel2 px-3 py-2 text-[13px] text-dt-text focus:border-dt-yellow focus:outline-none" />
      </label>
      <TextField label="Email người nhận đã lưu trên đơn" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} hint="Mã OTP chỉ xác thực email. Đơn cũ chưa lưu email người nhận cần liên hệ hỗ trợ." />
      <button type="button" disabled={busy || !email} onClick={() => void sendOtp()} className="rounded-md border border-dt-yellow px-4 py-2 text-sm text-dt-yellow disabled:opacity-50">Gửi mã OTP email</button>
      <TextField label="Mã OTP" inputMode="numeric" required value={otp} onChange={(event) => setOtp(event.target.value)} />
      {notice ? <p role="status" className="text-xs text-dt-green">{notice}</p> : null}
      {error ? <p role="alert" className="text-xs text-dt-red">{error}</p> : null}
      <button type="submit" disabled={busy} className="rounded-md bg-dt-yellow px-5 py-3 text-sm font-semibold text-dt-bg disabled:opacity-50">{busy ? "Đang gửi…" : "Gửi phản hồi"}</button>
    </form>}
  </Card>;
}
