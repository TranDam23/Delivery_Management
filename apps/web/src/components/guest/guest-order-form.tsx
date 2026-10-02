"use client";

import { useState } from "react";
import Link from "next/link";
import { AddressLocationFields } from "@/components/locations/address-location-fields";
import { SelectField, TextField } from "@/components/ui/field";
import { guestPost } from "./guest-api";
import { ShippingPaymentFields } from "@/components/payments/shipping-payment-fields";
import { calculateShippingFee } from "@/lib/shipping-fee";
import type { ShippingFeePayer, ShippingPaymentMethod } from "@/lib/shipping-payment";

type Address = { name: string; phone: string; addressLine: string; province: string; district: string; ward: string; email?: string };
const EMPTY_ADDRESS: Address = { name: "", phone: "", addressLine: "", province: "", district: "", ward: "" };

function AddressSection({ title, value, onChange, recipient = false }: { title: string; value: Address; onChange: (value: Address) => void; recipient?: boolean }): React.JSX.Element {
  return <section className="space-y-4 rounded-dt border border-dt-border bg-dt-panel p-5">
    <h2 className="text-base font-semibold">{title}</h2>
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="Họ và tên" required value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      <TextField label="Số điện thoại" required type="tel" inputMode="numeric" value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} />
    </div>
    {recipient ? <TextField label="Email người nhận" type="email" required value={value.email ?? ""} onChange={(event) => onChange({ ...value, email: event.target.value })} hint="Người nhận dùng email này để xác thực và gửi đánh giá hoặc phản ánh sau giao hàng." /> : null}
    <AddressLocationFields value={value} onChange={(location) => onChange({ ...value, ...location })} />
    <TextField label="Số nhà, tên đường" required value={value.addressLine} onChange={(event) => onChange({ ...value, addressLine: event.target.value })} />
  </section>;
}

export function GuestOrderForm(): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sender, setSender] = useState<Address>(EMPTY_ADDRESS);
  const [receiver, setReceiver] = useState<Address>({ ...EMPTY_ADDRESS, email: "" });
  const [serviceType, setServiceType] = useState("standard");
  const [shippingFeePayer, setShippingFeePayer] = useState<ShippingFeePayer>("sender");
  const [shippingPaymentMethod, setShippingPaymentMethod] = useState<ShippingPaymentMethod>("cash");
  const [codAmount, setCodAmount] = useState("0");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [weight, setWeight] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");

  async function sendOtp() {
    setError(""); setMessage(""); setBusy(true);
    try {
      const result = await guestPost<{ message: string }>("/api/guest/otp", { email });
      setMessage(result.message);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không gửi được OTP."); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (!sender.province || !sender.ward || !receiver.province || !receiver.ward) {
      setError("Vui lòng chọn đầy đủ tỉnh/thành phố và xã/phường cho cả hai địa chỉ."); return;
    }
    setBusy(true);
    try {
      const result = await guestPost<{ trackingCode: string; routeStatus: string }>("/api/guest/orders", {
        email, otp, sender, receiver, serviceType,
        shippingFeePayer, shippingPaymentMethod,
        codAmount: Number(codAmount), note,
        item: { name, type, quantity: Number(quantity), weight: weight ? Number(weight) : null,
          declaredValue: declaredValue ? Number(declaredValue) : null, note: "" },
      });
      setTrackingCode(result.trackingCode);
      if (result.routeStatus === "PENDING_REPAIR") setMessage("Đơn đã tạo; tuyến đang chờ điều phối viên kiểm tra.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Chưa tạo được đơn."); }
    finally { setBusy(false); }
  }

  if (trackingCode) return <div className="rounded-dt border border-dt-green/40 bg-dt-panel p-6">
    <h2 className="text-xl font-semibold text-dt-green">Tạo đơn thành công</h2>
    <p className="mt-3 text-sm">Mã vận đơn: <strong className="text-dt-yellow">{trackingCode}</strong></p>
    {message && <p className="mt-2 text-xs text-dt-muted">{message}</p>}
      <p className="mt-2 text-xs text-dt-muted">Hãy lưu mã này. Bạn có thể xác thực email để xem lại các đơn, hoặc nhập thêm số điện thoại để lọc.</p>
    <Link className="mt-4 inline-block text-sm text-dt-yellow underline" href={`/tra-cuu/${encodeURIComponent(trackingCode)}`}>Xem hành trình đơn hàng</Link>
  </div>;

  return <form className="space-y-5" onSubmit={submit}>
    <AddressSection title="Thông tin người gửi và địa chỉ lấy hàng" value={sender} onChange={setSender} />
    <AddressSection title="Thông tin người nhận và địa chỉ giao hàng" value={receiver} onChange={setReceiver} recipient />
    <section className="space-y-4 rounded-dt border border-dt-border bg-dt-panel p-5">
      <h2 className="text-base font-semibold">Hàng hóa và dịch vụ</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Tên hàng hóa" required value={name} onChange={(event) => setName(event.target.value)} />
        <TextField label="Loại hàng" value={type} onChange={(event) => setType(event.target.value)} />
        <TextField label="Số lượng" type="number" min="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        <TextField label="Khối lượng (kg)" type="number" min="0.01" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} />
        <TextField label="Giá trị khai báo (đ)" type="number" min="0" value={declaredValue} onChange={(event) => setDeclaredValue(event.target.value)} />
        <TextField label="COD cần thu hộ (đ)" type="number" min="0" required value={codAmount} onChange={(event) => setCodAmount(event.target.value)} />
      </div>
      <SelectField label="Dịch vụ" required value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
        <option value="standard">Tiêu chuẩn — từ 30.000đ</option><option value="express">Hỏa tốc — từ 50.000đ</option><option value="same_day">Trong ngày — từ 70.000đ</option>
      </SelectField>
      <ShippingPaymentFields payer={shippingFeePayer} method={shippingPaymentMethod} onPayerChange={setShippingFeePayer} onMethodChange={setShippingPaymentMethod} fee={calculateShippingFee(serviceType as "standard" | "express" | "same_day", [{ weight: Number(weight) || undefined, quantity: Number(quantity) || 1 }])} />
      <TextField label="Ghi chú giao hàng" value={note} onChange={(event) => setNote(event.target.value)} />
    </section>
    <section className="space-y-4 rounded-dt border border-dt-border bg-dt-panel p-5">
      <h2 className="text-base font-semibold">Xác thực email người gửi</h2>
      <p className="text-xs text-dt-muted">Mã OTP sẽ gửi tới email này. Sau này bạn có thể xác thực email để tra lại các mã vận đơn đã tạo.</p>
      <TextField label="Email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <button type="button" disabled={busy || !email} onClick={sendOtp} className="rounded-md border border-dt-yellow px-4 py-2 text-sm text-dt-yellow disabled:opacity-50">Gửi mã OTP</button>
      <TextField label="Mã OTP trong email" inputMode="numeric" required value={otp} onChange={(event) => setOtp(event.target.value)} />
      {message && <p role="status" className="text-xs text-dt-green">{message}</p>}
      {error && <p role="alert" className="text-xs text-dt-red">{error}</p>}
      <button type="submit" disabled={busy} className="rounded-md bg-dt-yellow px-5 py-3 text-sm font-semibold text-dt-bg disabled:opacity-50">{busy ? "Đang xử lý…" : "Xác thực và tạo đơn"}</button>
    </section>
  </form>;
}
