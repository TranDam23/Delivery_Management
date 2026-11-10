"use client";

import Link from "next/link";
import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { AddressLocationFields } from "@/components/locations/address-location-fields";
import { AddressMapPicker, type AddressMapValue } from "@/components/locations/address-map-picker";
import { PageHeader } from "@/components/layout/page-header";
import { ShippingPaymentFields } from "@/components/payments/shipping-payment-fields";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import type { ShippingFeePayer, ShippingPaymentMethod } from "@/lib/shipping-payment";
import { describeQuote, useShippingQuote } from "@/lib/use-shipping-quote";

interface Party extends AddressMapValue {
  name: string;
  phone: string;
  email: string;
  addressLine: string;
  province: string;
  district: string;
  ward: string;
}

const EMPTY_PIN: AddressMapValue = { latitude: null, longitude: null, place_id: null, formatted_address: null, location_source: null };
const EMPTY_PARTY: Party = { name: "", phone: "", email: "", addressLine: "", province: "", district: "", ward: "", ...EMPTY_PIN };

interface Created {
  id: string;
  tracking_code: string;
  route_status?: string;
  route_warning?: string;
}

function PartyFields({ title, value, onChange }: { title: string; value: Party; onChange: (value: Party) => void }): React.JSX.Element {
  return (
    <Card className="gap-4">
      <CardLabel>{title}</CardLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Họ và tên" required value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
        <TextField label="Số điện thoại" required type="tel" inputMode="numeric" value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} hint="10 chữ số, bắt đầu bằng 0" />
      </div>
      <TextField label="Email" type="email" value={value.email} onChange={(event) => onChange({ ...value, email: event.target.value })} hint="Không bắt buộc" />
      <AddressLocationFields value={value} onChange={(location) => onChange({ ...value, ...location, ...EMPTY_PIN })} />
      <TextField label="Số nhà, tên đường" required value={value.addressLine} onChange={(event) => onChange({ ...value, addressLine: event.target.value, ...EMPTY_PIN })} />
      <AddressMapPicker value={value} onChange={(pin) => onChange({ ...value, ...pin })} address={{ line: value.addressLine, ward: value.ward, district: value.district, province: value.province }} />
    </Card>
  );
}

/** Điều phối viên tiếp nhận tại quầy và tạo đơn hộ khách (người gửi/nhận nhập trực tiếp, không cần tài khoản). */
export function DispatcherOrderCreatePage({ ordersPath }: { ordersPath: string }): React.JSX.Element {
  const [sender, setSender] = useState<Party>(EMPTY_PARTY);
  const [receiver, setReceiver] = useState<Party>(EMPTY_PARTY);
  const [serviceType, setServiceType] = useState("standard");
  const [payer, setPayer] = useState<ShippingFeePayer>("sender");
  const [method, setMethod] = useState<ShippingPaymentMethod>("cash");
  const [codAmount, setCodAmount] = useState("0");
  const [itemName, setItemName] = useState("");
  const [itemType, setItemType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  // Giữ một khóa cho mỗi lần nhập để bấm "Tạo đơn" lại sau lỗi mạng không sinh đơn trùng.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const num = (value: string): number | undefined => (Number(value) > 0 ? Number(value) : undefined);
  const { quote } = useShippingQuote({
    service: serviceType as "standard" | "express" | "same_day",
    pickupProvince: sender.province,
    deliveryProvince: receiver.province,
    pickupWard: sender.ward,
    deliveryWard: receiver.ward,
    items: [{ weight: num(weight), length: num(length), width: num(width), height: num(height), quantity: num(quantity) ?? 1 }],
  });

  function validate(): string | null {
    for (const [label, party] of [["người gửi", sender], ["người nhận", receiver]] as const) {
      if (!party.name.trim() || !party.phone.trim() || !party.addressLine.trim() || !party.province || !party.ward) {
        return `Vui lòng nhập đủ họ tên, số điện thoại, tỉnh/thành phố, xã/phường và địa chỉ của ${label}.`;
      }
    }
    if (!itemName.trim()) return "Vui lòng nhập tên hàng hóa.";
    if (quote && !quote.available) return quote.message ?? "Dịch vụ không áp dụng cho tuyến này.";
    return null;
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const toQuick = (role: "sender" | "receiver", party: Party) => apiFetch<{ contact_id: string; address_id: string }>("/api/contacts/quick", {
        method: "POST",
        body: JSON.stringify({
          role, name: party.name, phone: party.phone, email: party.email || undefined,
          address_line: party.addressLine, ward: party.ward, district: party.district, province: party.province,
          latitude: party.latitude, longitude: party.longitude, place_id: party.place_id,
          formatted_address: party.formatted_address, location_source: party.location_source,
        }),
      });
      const senderRef = await toQuick("sender", sender);
      const receiverRef = await toQuick("receiver", receiver);
      const order = await apiFetch<Created>("/api/orders", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          sender_id: senderRef.contact_id,
          receiver_id: receiverRef.contact_id,
          pickup_address_id: senderRef.address_id,
          delivery_address_id: receiverRef.address_id,
          service_type: serviceType,
          cod_amount: Number(codAmount) || 0,
          shipping_fee_payer: payer,
          shipping_payment_method: method,
          note: note.trim() || undefined,
          items: [{
            item_name: itemName.trim(),
            item_type: itemType.trim() || undefined,
            quantity: num(quantity) ?? 1,
            weight: num(weight), length: num(length), width: num(width), height: num(height),
            declared_value: declaredValue ? Number(declaredValue) : undefined,
          }],
        }),
      });
      setCreated(order);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tạo được đơn hàng");
    } finally {
      setBusy(false);
    }
  }

  function reset(): void {
    setSender(EMPTY_PARTY); setReceiver(EMPTY_PARTY); setItemName(""); setItemType(""); setQuantity("1");
    setWeight(""); setLength(""); setWidth(""); setHeight(""); setDeclaredValue(""); setNote(""); setCodAmount("0");
    setServiceType("standard"); setPayer("sender"); setMethod("cash");
    setCreated(null); setError(null); setIdempotencyKey(crypto.randomUUID());
  }

  return (
    <div className="min-h-screen bg-dt-bg text-dt-text">
      <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 px-5 py-6 md:px-8 md:py-8">
        <PageHeader heading="Tạo đơn hộ khách" subtitle="Tiếp nhận tại quầy: nhập trực tiếp người gửi, người nhận và hàng hóa. Cước được tính theo bảng giá hiện hành." />
        {created ? (
          <Card className="gap-3 border-dt-green/40">
            <CardLabel>Đã tạo đơn</CardLabel>
            <p className="text-[15px] font-semibold">{created.tracking_code}</p>
            {created.route_status === "PENDING_REPAIR" ? <p className="text-[12px] text-dt-yellow">Đơn chưa tự lập được tuyến: {created.route_warning ?? "cần điều phối viên kiểm tra"}. Hãy lập tuyến trong mục Kho &amp; tuyến.</p> : <p className="text-[12px] text-dt-muted">Hệ thống đã tự lập tuyến vận chuyển cho đơn.</p>}
            <div className="flex flex-wrap gap-2">
              <Link href={`${ordersPath}/${created.id}`} className={buttonClassName()}>Xem đơn</Link>
              <Button variant="secondary" onClick={reset}><PackagePlus size={14} /> Tạo đơn khác</Button>
            </div>
          </Card>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
            <PartyFields title="Người gửi và địa chỉ lấy hàng" value={sender} onChange={setSender} />
            <PartyFields title="Người nhận và địa chỉ giao hàng" value={receiver} onChange={setReceiver} />
            <Card className="gap-4">
              <CardLabel>Hàng hóa và dịch vụ</CardLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Tên hàng hóa" required value={itemName} onChange={(event) => setItemName(event.target.value)} />
                <TextField label="Loại hàng" value={itemType} onChange={(event) => setItemType(event.target.value)} />
                <TextField label="Số lượng" type="number" min="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                <TextField label="Khối lượng (kg)" type="number" min="0.01" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} />
                <TextField label="Dài (cm)" type="number" min="0.1" max="1000" step="0.1" value={length} onChange={(event) => setLength(event.target.value)} />
                <TextField label="Rộng (cm)" type="number" min="0.1" max="1000" step="0.1" value={width} onChange={(event) => setWidth(event.target.value)} />
                <TextField label="Cao (cm)" type="number" min="0.1" max="1000" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} />
                <TextField label="Giá trị khai báo (đ)" type="number" min="0" value={declaredValue} onChange={(event) => setDeclaredValue(event.target.value)} />
                <TextField label="COD cần thu hộ (đ)" type="number" min="0" value={codAmount} onChange={(event) => setCodAmount(event.target.value)} />
              </div>
              <SelectField label="Dịch vụ" required value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
                <option value="standard">Tiêu chuẩn</option>
                <option value="express">Hỏa tốc</option>
                <option value="same_day">Trong ngày (chỉ nội tỉnh)</option>
              </SelectField>
              <ShippingPaymentFields payer={payer} method={method} onPayerChange={setPayer} onMethodChange={setMethod} fee={quote?.fee ?? null} feeDetail={describeQuote(quote)} feeNote={quote && !quote.available ? quote.message : null} />
              <TextField label="Ghi chú giao hàng" value={note} onChange={(event) => setNote(event.target.value)} />
            </Card>
            {error ? <p role="alert" className="rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>{busy ? "Đang tạo đơn..." : "Tạo đơn"}</Button>
              <Link href={ordersPath} className={buttonClassName("secondary")}>Hủy</Link>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
