"use client";

import { ArrowLeft, CheckCircle2, MapPin, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ContactType,
  canBeReceiver,
  canBeSender,
  normalizePhone,
  type Address,
  type ContactWithDefaultAddress,
  type Paginated,
} from "@delivery/shared";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { AddressLocationFields } from "@/components/locations/address-location-fields";
import { AddressMapPicker, type AddressMapValue } from "@/components/locations/address-map-picker";
import { ContactAddressSelector } from "@/components/contacts/contact-address-selector";
import { apiFetch } from "@/lib/api-client";
import { ShippingPaymentFields } from "@/components/payments/shipping-payment-fields";
import type { ShippingFeePayer, ShippingPaymentMethod } from "@/lib/shipping-payment";
import { calculateShippingFee } from "@/lib/shipping-fee";

interface FormState {
  senderId: string;
  receiverId: string;
  serviceType: string;
  itemName: string;
  itemType: string;
  quantity: string;
  weight: string;
  declaredValue: string;
  codAmount: string;
  note: string;
}

type ContactSource = "addressBook" | "manual";

interface ManualContactForm extends AddressMapValue {
  name: string;
  phone: string;
  email: string;
  addressLine: string;
  ward: string;
  district: string;
  province: string;
}

const EMPTY_MANUAL_CONTACT: ManualContactForm = {
  name: "",
  phone: "",
  email: "",
  addressLine: "",
  ward: "",
  district: "",
  province: "",
  latitude: null,
  longitude: null,
  place_id: null,
  formatted_address: null,
  location_source: null,
};
const EMPTY_ADDRESS_PIN: AddressMapValue = {
  latitude: null,
  longitude: null,
  place_id: null,
  formatted_address: null,
  location_source: null,
};

const INITIAL_FORM: FormState = {
  senderId: "",
  receiverId: "",
  serviceType: "standard",
  itemName: "",
  itemType: "",
  quantity: "1",
  weight: "",
  declaredValue: "",
  codAmount: "0",
  note: "",
};

const SERVICE_OPTIONS = [
  { value: "standard", label: "Tiêu chuẩn — 30.000đ" },
  { value: "express", label: "Hỏa tốc — 50.000đ" },
  { value: "same_day", label: "Trong ngày — 70.000đ" },
];

function numericValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function manualContactFromContact(contact: ContactWithDefaultAddress, address = contact.default_address): ManualContactForm {
  return {
    name: contact.name,
    phone: contact.phone,
    email: contact.email ?? "",
    addressLine: address?.address_line ?? "",
    ward: address?.ward ?? "",
    district: address?.district ?? "",
    province: address?.province ?? "",
    latitude: address?.latitude ?? null,
    longitude: address?.longitude ?? null,
    place_id: address?.place_id ?? null,
    formatted_address: address?.formatted_address ?? null,
    location_source: address?.location_source ?? null,
  };
}

function validateManualContact(contact: ManualContactForm, label: string): string | null {
  const missing = [
    !contact.name.trim() ? "họ tên" : null,
    !contact.phone.trim() ? "số điện thoại" : null,
    !contact.addressLine.trim() ? "địa chỉ cụ thể" : null,
    !contact.ward.trim() ? "xã/phường" : null,
    !contact.province.trim() ? "tỉnh/thành phố" : null,
  ].filter((field): field is string => Boolean(field));
  if (missing.length > 0) {
    return `Vui lòng nhập ${missing.join(", ")} của ${label} trước khi tạo đơn.`;
  }

  if (!/^0\d{9}$/.test(normalizePhone(contact.phone))) {
    return `Số điện thoại của ${label} phải gồm 10 chữ số và bắt đầu bằng 0.`;
  }

  return null;
}

function validateRoutingAddress(address: Address | null | undefined, label: string): string | null {
  const missing = [
    !address?.ward?.trim() ? "xã/phường" : null,
    !address?.province?.trim() ? "tỉnh/thành phố" : null,
  ].filter((field): field is string => Boolean(field));
  if (missing.length > 0) {
    return `Vui lòng bổ sung ${missing.join(", ")} cho địa chỉ ${label} để hệ thống phân tuyến qua kho.`;
  }
  return null;
}

interface ManualContactFieldsProps {
  roleLabel: string;
  addressLabel: string;
  value: ManualContactForm;
  onChange: (field: keyof ManualContactForm, value: string) => void;
  onMapChange: (value: AddressMapValue) => void;
}

function ManualContactFields({
  roleLabel,
  addressLabel,
  value,
  onChange,
  onMapChange,
}: ManualContactFieldsProps): React.JSX.Element {
  function updateAddressField(field: "addressLine" | "province" | "district" | "ward", nextValue: string): void {
    onChange(field, nextValue);
    onMapChange(EMPTY_ADDRESS_PIN);
  }

  return (
    <div className="space-y-3 rounded-md border border-dt-yellow/25 bg-dt-yellow/5 p-3">
      <p className="text-[11px] font-medium text-dt-yellow">Nhập thông tin {roleLabel.toLowerCase()}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Họ tên"
          required
          value={value.name}
          onChange={(event) => onChange("name", event.target.value)}
        />
        <TextField
          label="Số điện thoại"
          required
          inputMode="tel"
          value={value.phone}
          onChange={(event) => onChange("phone", event.target.value)}
        />
      </div>
      {roleLabel === "người nhận" ? <TextField label="Email người nhận" type="email" value={value.email} onChange={(event) => onChange("email", event.target.value)} hint="Nhập email để người nhận xác thực và đánh giá hoặc phản ánh sau giao hàng." /> : null}
      <TextField
        label={addressLabel}
        required
        placeholder="Số nhà, tên đường"
        value={value.addressLine}
        onChange={(event) => updateAddressField("addressLine", event.target.value)}
      />
      <AddressLocationFields
        value={{ province: value.province, district: value.district, ward: value.ward }}
        onChange={(location) => {
          updateAddressField("province", location.province);
          updateAddressField("district", location.district);
          updateAddressField("ward", location.ward);
        }}
      />
      <AddressMapPicker value={value} onChange={onMapChange} />
      <p className="text-[10px] leading-4 text-dt-muted">Thông tin nhập trực tiếp sẽ được lưu vào sổ địa chỉ để dùng lại cho các đơn sau.</p>
    </div>
  );
}

async function ensureManualContact({
  input,
  type,
  contacts,
  cache,
}: {
  input: ManualContactForm;
  type: ContactType;
  contacts: ContactWithDefaultAddress[];
  cache: Map<string, ContactWithDefaultAddress>;
}): Promise<ContactWithDefaultAddress> {
  const normalizedPhone = normalizePhone(input.phone);
  let contact = cache.get(normalizedPhone) ?? contacts.find((item) => normalizePhone(item.phone) === normalizedPhone);

  if (!contact) {
    contact = await apiFetch<ContactWithDefaultAddress>("/api/contacts", {
      method: "POST",
      body: JSON.stringify({
        type,
        name: input.name.trim(),
        phone: normalizedPhone,
        email: input.email.trim().toLowerCase() || null,
      }),
    });
  } else {
    const changes: { name?: string; type?: ContactType; email?: string } = {};
    if (contact.name !== input.name.trim()) changes.name = input.name.trim();
    if (type === ContactType.SENDER && !canBeSender(contact.type)) changes.type = ContactType.BOTH;
    if (type === ContactType.RECEIVER && !canBeReceiver(contact.type)) changes.type = ContactType.BOTH;
    if (input.email.trim() && contact.email !== input.email.trim().toLowerCase()) changes.email = input.email.trim().toLowerCase();

    if (Object.keys(changes).length > 0) {
      contact = await apiFetch<ContactWithDefaultAddress>(`/api/contacts/${encodeURIComponent(contact.id)}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
    }
  }

  const address = await apiFetch<Address>(`/api/contacts/${encodeURIComponent(contact.id)}/addresses`, {
    method: "POST",
    body: JSON.stringify({
      recipient_name: input.name.trim(),
      phone: normalizedPhone,
      address_line: input.addressLine.trim(),
      ward: input.ward.trim() || undefined,
      district: input.district.trim() || undefined,
      province: input.province.trim() || undefined,
      latitude: input.latitude,
      longitude: input.longitude,
      place_id: input.place_id,
      formatted_address: input.formatted_address,
      location_source: input.location_source,
      is_default: true,
    }),
  });

  const resolved = { ...contact, default_address_id: address.id, default_address: address };
  cache.set(normalizedPhone, resolved);
  return resolved;
}

export function NewOrderPage(): React.JSX.Element {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [shippingFeePayer, setShippingFeePayer] = useState<ShippingFeePayer>("sender");
  const [shippingPaymentMethod, setShippingPaymentMethod] = useState<ShippingPaymentMethod>("cash");
  const [senderSource, setSenderSource] = useState<ContactSource>("addressBook");
  const [receiverSource, setReceiverSource] = useState<ContactSource>("addressBook");
  const [manualSender, setManualSender] = useState<ManualContactForm>(EMPTY_MANUAL_CONTACT);
  const [manualReceiver, setManualReceiver] = useState<ManualContactForm>(EMPTY_MANUAL_CONTACT);
  const [senderAddress, setSenderAddress] = useState<Address | null>(null);
  const [receiverAddress, setReceiverAddress] = useState<Address | null>(null);
  const [contacts, setContacts] = useState<ContactWithDefaultAddress[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadContacts(): Promise<void> {
      try {
        const page = await apiFetch<Paginated<ContactWithDefaultAddress>>("/api/contacts?pageSize=100");
        if (!mounted) return;
        setContacts(page.items);
        const firstSender = page.items.find((contact) => canBeSender(contact.type));
        const firstReceiver = page.items.find((contact) => canBeReceiver(contact.type));
        setForm((current) => ({
          ...current,
          senderId: current.senderId || firstSender?.id || "",
          receiverId: current.receiverId || firstReceiver?.id || "",
        }));
        setSenderSource((current) => current === "manual" || firstSender ? current : "manual");
        setReceiverSource((current) => current === "manual" || firstReceiver ? current : "manual");
      } catch (caught) {
        if (mounted) setFormError(caught instanceof Error ? caught.message : "Không tải được sổ địa chỉ");
      } finally {
        if (mounted) setLoadingContacts(false);
      }
    }

    void loadContacts();
    return () => {
      mounted = false;
    };
  }, []);

  const senderContacts = useMemo(() => contacts.filter((contact) => canBeSender(contact.type)), [contacts]);
  const receiverContacts = useMemo(() => contacts.filter((contact) => canBeReceiver(contact.type)), [contacts]);
  const selectedSender = contacts.find((contact) => contact.id === form.senderId);
  const selectedReceiver = contacts.find((contact) => contact.id === form.receiverId);
  const weight = numericValue(form.weight);
  const estimatedFee = calculateShippingFee(form.serviceType as "standard" | "express" | "same_day", [{ weight, quantity: numericValue(form.quantity) || 1 }]);

  function update(field: keyof FormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
    if (formError) setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const quantity = numericValue(form.quantity);
    const codAmount = numericValue(form.codAmount);
    const declaredValue = numericValue(form.declaredValue);

    if (senderSource === "addressBook" && !selectedSender) {
      setFormError("Vui lòng chọn người gửi trong sổ địa chỉ hoặc chuyển sang nhập trực tiếp.");
      return;
    }
    if (receiverSource === "addressBook" && !selectedReceiver) {
      setFormError("Vui lòng chọn người nhận trong sổ địa chỉ hoặc chuyển sang nhập trực tiếp.");
      return;
    }
    const senderManualError = senderSource === "manual" ? validateManualContact(manualSender, "người gửi") : null;
    if (senderManualError) {
      setFormError(senderManualError);
      return;
    }
    const receiverManualError = receiverSource === "manual" ? validateManualContact(manualReceiver, "người nhận") : null;
    if (receiverManualError) {
      setFormError(receiverManualError);
      return;
    }
    if (senderSource === "addressBook" && !senderAddress) {
      setFormError("Vui lòng chọn một địa chỉ lấy hàng trong sổ địa chỉ.");
      return;
    }
    if (receiverSource === "addressBook" && !receiverAddress) {
      setFormError("Vui lòng chọn một địa chỉ giao hàng trong sổ địa chỉ.");
      return;
    }
    if (!form.itemName.trim()) {
      setFormError("Vui lòng nhập tên hàng hóa.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setFormError("Số lượng phải là số nguyên lớn hơn 0.");
      return;
    }
    if (weight < 0 || codAmount < 0 || declaredValue < 0) {
      setFormError("Khối lượng, giá trị khai báo và COD không được âm.");
      return;
    }

    setSubmitting(true);
    try {
      const manualContactCache = new Map<string, ContactWithDefaultAddress>();
      const sender = senderSource === "manual"
        ? await ensureManualContact({ input: manualSender, type: ContactType.SENDER, contacts, cache: manualContactCache })
        : selectedSender;
      const receiver = receiverSource === "manual"
        ? await ensureManualContact({ input: manualReceiver, type: ContactType.RECEIVER, contacts, cache: manualContactCache })
        : selectedReceiver;

      if (!sender || !receiver) {
        setFormError("Không xác định được thông tin người gửi hoặc người nhận.");
        return;
      }
      const pickupAddress = senderSource === "manual" ? sender.default_address : senderAddress;
      const deliveryAddress = receiverSource === "manual" ? receiver.default_address : receiverAddress;
      if (!pickupAddress || !deliveryAddress) {
        setFormError("Người gửi và người nhận phải có địa chỉ được chọn trước khi tạo đơn.");
        return;
      }
      const pickupAddressError = validateRoutingAddress(pickupAddress, "lấy hàng");
      if (pickupAddressError) {
        setFormError(pickupAddressError);
        return;
      }
      const deliveryAddressError = validateRoutingAddress(deliveryAddress, "giao hàng");
      if (deliveryAddressError) {
        setFormError(deliveryAddressError);
        return;
      }

      const created = await apiFetch<{ id: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          sender_id: sender.id,
          receiver_id: receiver.id,
          pickup_address_id: pickupAddress.id,
          delivery_address_id: deliveryAddress.id,
          service_type: form.serviceType,
          cod_amount: codAmount,
          shipping_fee_payer: shippingFeePayer,
          shipping_payment_method: shippingPaymentMethod,
          note: form.note.trim() || undefined,
          items: [{
            item_name: form.itemName.trim(),
            item_type: form.itemType.trim() || undefined,
            quantity,
            weight: form.weight.trim() ? weight : undefined,
            declared_value: form.declaredValue.trim() ? declaredValue : undefined,
          }],
        }),
      });
      router.push(`/orders/${created.id}`);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Không tạo được đơn hàng");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        heading="Tạo đơn hàng"
        subtitle="Chọn liên hệ trong sổ địa chỉ hoặc nhập trực tiếp thông tin để tạo đơn gửi."
        action={<Link href="/customer" className={buttonClassName("secondary")}><ArrowLeft size={14} /> Về tổng quan</Link>}
      />

      {contacts.length === 0 && !loadingContacts ? (
        <Card className="border-dt-yellow/30 bg-dt-yellow/5">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 shrink-0 text-dt-yellow" size={18} />
            <div>
              <p className="text-[13px] font-medium">Sổ địa chỉ chưa có liên hệ</p>
              <p className="mt-1 text-[12px] leading-5 text-dt-muted">Bạn vẫn có thể nhập trực tiếp người gửi và người nhận ở bên dưới, hoặc thêm liên hệ để dùng lại.</p>
              <Link href="/contacts/new" className={`${buttonClassName()} mt-3 w-fit`}><Plus size={14} /> Thêm liên hệ</Link>
            </div>
          </div>
        </Card>
      ) : null}

      <form onSubmit={handleSubmit} className="grid max-w-[1100px] gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className="space-y-4">
          <Card>
            <CardLabel>Thông tin giao nhận</CardLabel>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-dt-muted">Người gửi *</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (senderSource === "addressBook" && selectedSender) setManualSender(manualContactFromContact(selectedSender, senderAddress));
                      setSenderSource((current) => current === "addressBook" ? "manual" : "addressBook");
                    }}
                    className="text-[11px] text-dt-yellow hover:underline"
                    aria-pressed={senderSource === "manual"}
                  >
                    {senderSource === "addressBook" ? "Nhập trực tiếp" : "Chọn từ sổ địa chỉ"}
                  </button>
                </div>
                {senderSource === "addressBook" ? (
                  <>
                    <SelectField
                      label="Liên hệ trong sổ địa chỉ"
                      required
                      value={form.senderId}
                      disabled={loadingContacts || senderContacts.length === 0}
                      onChange={(event) => {
                        setSenderAddress(null);
                        update("senderId", event.target.value);
                      }}
                      hint="Liên hệ phải có vai trò Người gửi hoặc Cả hai"
                    >
                      <option value="" className="bg-dt-panel2">Chọn người gửi</option>
                      {senderContacts.map((contact) => (
                        <option key={contact.id} value={contact.id} className="bg-dt-panel2">
                          {contact.name} · {contact.phone}{contact.default_address ? "" : " (chưa có địa chỉ)"}
                        </option>
                      ))}
                    </SelectField>
                    {selectedSender ? (
                      <ContactAddressSelector
                        key={selectedSender.id}
                        contactId={selectedSender.id}
                        roleLabel="lấy hàng"
                        onSelect={setSenderAddress}
                      />
                    ) : null}
                  </>
                ) : (
                  <ManualContactFields
                    roleLabel="người gửi"
                    addressLabel="Địa chỉ lấy hàng"
                    value={manualSender}
                    onChange={(field, value) => setManualSender((current) => ({ ...current, [field]: value }))}
                    onMapChange={(location) => setManualSender((current) => ({ ...current, ...location }))}
                  />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-dt-muted">Người nhận *</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (receiverSource === "addressBook" && selectedReceiver) setManualReceiver(manualContactFromContact(selectedReceiver, receiverAddress));
                      setReceiverSource((current) => current === "addressBook" ? "manual" : "addressBook");
                    }}
                    className="text-[11px] text-dt-yellow hover:underline"
                    aria-pressed={receiverSource === "manual"}
                  >
                    {receiverSource === "addressBook" ? "Nhập trực tiếp" : "Chọn từ sổ địa chỉ"}
                  </button>
                </div>
                {receiverSource === "addressBook" ? (
                  <>
                    <SelectField
                      label="Liên hệ trong sổ địa chỉ"
                      required
                      value={form.receiverId}
                      disabled={loadingContacts || receiverContacts.length === 0}
                      onChange={(event) => {
                        setReceiverAddress(null);
                        update("receiverId", event.target.value);
                      }}
                      hint="Liên hệ phải có vai trò Người nhận hoặc Cả hai"
                    >
                      <option value="" className="bg-dt-panel2">Chọn người nhận</option>
                      {receiverContacts.map((contact) => (
                        <option key={contact.id} value={contact.id} className="bg-dt-panel2">
                          {contact.name} · {contact.phone}{contact.default_address ? "" : " (chưa có địa chỉ)"}
                        </option>
                      ))}
                    </SelectField>
                    {selectedReceiver ? (
                      <ContactAddressSelector
                        key={selectedReceiver.id}
                        contactId={selectedReceiver.id}
                        roleLabel="giao hàng"
                        onSelect={setReceiverAddress}
                      />
                    ) : null}
                  </>
                ) : (
                  <ManualContactFields
                    roleLabel="người nhận"
                    addressLabel="Địa chỉ giao hàng"
                    value={manualReceiver}
                    onChange={(field, value) => setManualReceiver((current) => ({ ...current, [field]: value }))}
                    onMapChange={(location) => setManualReceiver((current) => ({ ...current, ...location }))}
                  />
                )}
              </div>
            </div>

            <p className="text-[11px] text-dt-muted">Đơn hàng sẽ dùng đúng địa chỉ lấy và giao bạn đã chọn; việc chọn địa chỉ khác không làm thay đổi địa chỉ mặc định trong sổ.</p>
          </Card>

          <Card>
            <CardLabel>Hàng hóa</CardLabel>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <TextField label="Tên hàng hóa" required value={form.itemName} placeholder="Ví dụ: Hồ sơ hợp đồng" onChange={(event) => update("itemName", event.target.value)} />
              <TextField label="Loại hàng" value={form.itemType} placeholder="Hồ sơ, quần áo..." onChange={(event) => update("itemType", event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Số lượng" type="number" min="1" step="1" required value={form.quantity} onChange={(event) => update("quantity", event.target.value)} />
              <TextField label="Khối lượng (kg)" type="number" min="0" step="0.01" value={form.weight} placeholder="Không bắt buộc" onChange={(event) => update("weight", event.target.value)} />
              <TextField label="Giá trị khai báo" type="number" min="0" step="1000" value={form.declaredValue} placeholder="Không bắt buộc" onChange={(event) => update("declaredValue", event.target.value)} />
            </div>
          </Card>

          <Card>
            <CardLabel>Ghi chú</CardLabel>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[11px] font-medium text-dt-muted">Lưu ý cho đơn hàng</span>
              <textarea value={form.note} onChange={(event) => update("note", event.target.value)} placeholder="Ví dụ: Gọi trước khi giao..." rows={4} className="w-full resize-y rounded-dt border border-dt-border bg-dt-panel2 px-3 py-3 text-[13px] text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none" />
            </label>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardLabel>Dịch vụ và thanh toán</CardLabel>
            <SelectField label="Loại dịch vụ" required value={form.serviceType} onChange={(event) => update("serviceType", event.target.value)}>
              {SERVICE_OPTIONS.map((option) => <option key={option.value} value={option.value} className="bg-dt-panel2">{option.label}</option>)}
            </SelectField>
            <TextField label="COD cần thu hộ" type="number" min="0" step="1000" value={form.codAmount} onChange={(event) => update("codAmount", event.target.value)} hint="Để 0 nếu đơn không thu hộ" />
            <ShippingPaymentFields payer={shippingFeePayer} method={shippingPaymentMethod} onPayerChange={setShippingFeePayer} onMethodChange={setShippingPaymentMethod} fee={estimatedFee} />
          </Card>

          <Card className="border-dt-green/25 bg-dt-green/5">
            <div className="flex items-start gap-3"><Truck className="mt-0.5 shrink-0 text-dt-green" size={18} /><div><p className="text-[12px] font-medium">Mã vận đơn tự động</p><p className="mt-1 text-[11px] leading-5 text-dt-muted">Sau khi tạo, hệ thống sinh mã vận đơn và QR để bạn theo dõi đơn.</p></div></div>
          </Card>

          {formError ? <p role="alert" className="rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[12px] leading-5 text-red-200">{formError}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Link href="/customer" className={buttonClassName("secondary")}>Hủy</Link>
            <Button type="submit" disabled={submitting || loadingContacts}>
              <CheckCircle2 size={15} />
              {submitting ? "Đang tạo đơn..." : "Tạo đơn hàng"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
