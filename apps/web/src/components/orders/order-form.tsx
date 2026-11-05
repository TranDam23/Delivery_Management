"use client";

import { ArrowLeft, CheckCircle2, MapPin, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { ApiError, apiFetch } from "@/lib/api-client";
import { ShippingPaymentFields } from "@/components/payments/shipping-payment-fields";
import { usePaymentAvailability } from "@/lib/use-payment-availability";
import type { ShippingFeePayer, ShippingPaymentMethod } from "@/lib/shipping-payment";
import { useShippingQuote } from "@/lib/use-shipping-quote";

interface FormState {
  senderId: string;
  receiverId: string;
  serviceType: string;
  itemName: string;
  itemType: string;
  quantity: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  declaredValue: string;
  itemNote: string;
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
  length: "",
  width: "",
  height: "",
  declaredValue: "",
  itemNote: "",
  codAmount: "0",
  note: "",
};

const CREATE_ORDER_IDEMPOTENCY_STORAGE_KEY = "delivertrust:create-order-idempotency-attempt";

interface StoredOrderAttempt {
  key: string;
  fingerprint: string;
}

function readStoredOrderAttempt(): StoredOrderAttempt | null {
  for (const getStorage of [() => window.sessionStorage, () => window.localStorage]) {
    try {
      const storage = getStorage();
      const raw = storage.getItem(CREATE_ORDER_IDEMPOTENCY_STORAGE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<StoredOrderAttempt>;
      if (
        typeof parsed.key === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.key)
        && typeof parsed.fingerprint === "string"
        && /^[0-9a-f]{64}$/.test(parsed.fingerprint)
      ) {
        return { key: parsed.key, fingerprint: parsed.fingerprint };
      }
    } catch {
      // Try the other storage; an unavailable browser storage is not a submit failure.
    }
  }
  return null;
}

function persistOrderAttempt(attempt: StoredOrderAttempt): boolean {
  const value = JSON.stringify(attempt);
  let persisted = false;
  for (const getStorage of [() => window.sessionStorage, () => window.localStorage]) {
    try {
      const storage = getStorage();
      storage.setItem(CREATE_ORDER_IDEMPOTENCY_STORAGE_KEY, value);
      persisted = true;
    } catch {
      // Try the other browser storage, then keep the attempt in memory.
    }
  }
  return persisted;
}

function clearStoredOrderAttempt(key: string): void {
  for (const getStorage of [() => window.sessionStorage, () => window.localStorage]) {
    try {
      const storage = getStorage();
      const current = storage.getItem(CREATE_ORDER_IDEMPOTENCY_STORAGE_KEY);
      if (current && (JSON.parse(current) as Partial<StoredOrderAttempt>).key === key) {
        storage.removeItem(CREATE_ORDER_IDEMPOTENCY_STORAGE_KEY);
      }
    } catch {
      // Clearing best-effort storage must not replace the API result.
    }
  }
}

async function fingerprintOrderRequest(requestBody: string): Promise<string> {
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestBody));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const SERVICE_OPTIONS = [
  { value: "standard", label: "Tiêu chuẩn" },
  { value: "express", label: "Hỏa tốc" },
  { value: "same_day", label: "Trong ngày (chỉ nội tỉnh)" },
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
  const [receiverIsSender, setReceiverIsSender] = useState(false);
  const [shippingFeePayer, setShippingFeePayer] = useState<ShippingFeePayer>("sender");
  const [shippingPaymentMethod, setShippingPaymentMethod] = useState<ShippingPaymentMethod>("cash");
  const paymentAvailability = usePaymentAvailability();
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
  const submitLockRef = useRef(false);
  const idempotencyAttemptRef = useRef<StoredOrderAttempt | null>(null);

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
  const pickupProvince = senderSource === "manual" ? manualSender.province : senderAddress?.province ?? selectedSender?.default_address?.province;
  const deliveryProvince = receiverSource === "manual" ? manualReceiver.province : receiverAddress?.province ?? selectedReceiver?.default_address?.province;
  const { quote } = useShippingQuote({
    service: form.serviceType as "standard" | "express" | "same_day",
    pickupProvince,
    deliveryProvince,
    items: [{ weight, length: numericValue(form.length) || undefined, width: numericValue(form.width) || undefined, height: numericValue(form.height) || undefined, quantity: numericValue(form.quantity) || 1 }],
  });
  const estimatedFee = quote?.fee ?? null;

  function update(field: keyof FormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
    if (formError) setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setFormError(null);

    let orderCreated = false;
    try {
      const quantity = numericValue(form.quantity);
      const codAmount = numericValue(form.codAmount);
      const declaredValue = numericValue(form.declaredValue);
      const hasMoreThanTwoDecimals = (value: number): boolean =>
        Math.abs(value * 100 - Math.round(value * 100)) >= 0.000001;

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
      if (!form.itemName.trim() || form.itemName.trim().length > 200) {
        setFormError("Tên hàng hóa phải có từ 1 đến 200 ký tự.");
        return;
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
        setFormError("Số lượng phải là số nguyên từ 1 đến 10.000.");
        return;
      }
      if (
        (form.weight.trim() && (weight <= 0 || weight > 10000 || hasMoreThanTwoDecimals(weight)))
        || codAmount < 0
        || codAmount > 999999999999.99
        || hasMoreThanTwoDecimals(codAmount)
        || declaredValue < 0
        || declaredValue > 999999999999.99
        || hasMoreThanTwoDecimals(declaredValue)
      ) {
        setFormError("Khối lượng, giá trị khai báo và COD phải nằm trong giới hạn cho phép, tối đa hai chữ số thập phân.");
        return;
      }
      const dimensions = [form.length, form.width, form.height];
      if (dimensions.some((value) => value.trim() && (numericValue(value) <= 0 || numericValue(value) > 1000 || hasMoreThanTwoDecimals(numericValue(value))))) {
        setFormError("Mỗi chiều kích thước phải lớn hơn 0, không vượt quá 1.000 cm và có tối đa hai chữ số thập phân.");
        return;
      }
      if (form.itemNote.trim().length > 1000 || form.note.trim().length > 1000) {
        setFormError("Ghi chú không được vượt quá 1.000 ký tự.");
        return;
      }

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

      const requestBody = JSON.stringify({
        sender_id: sender.id,
        receiver_id: receiver.id,
        ...(receiverIsSender ? { receiver_is_sender: true } : {}),
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
          length: numericValue(form.length) > 0 ? numericValue(form.length) : undefined,
          width: numericValue(form.width) > 0 ? numericValue(form.width) : undefined,
          height: numericValue(form.height) > 0 ? numericValue(form.height) : undefined,
          declared_value: form.declaredValue.trim() ? declaredValue : undefined,
          note: form.itemNote.trim() || undefined,
        }],
      });
      const fingerprint = await fingerprintOrderRequest(requestBody);
      const storedAttempt = idempotencyAttemptRef.current ?? readStoredOrderAttempt();
      if (storedAttempt && storedAttempt.fingerprint !== fingerprint) {
        setFormError("Kết quả yêu cầu tạo đơn trước chưa xác định. Hãy giữ nguyên nội dung và gửi lại yêu cầu đó để kiểm tra kết quả trước khi tạo đơn khác.");
        return;
      }

      const idempotencyKey = storedAttempt?.key ?? window.crypto.randomUUID();
      const attempt = { key: idempotencyKey, fingerprint };
      idempotencyAttemptRef.current = attempt;
      const persisted = persistOrderAttempt(attempt);
      const created = await apiFetch<{ id: string }>("/api/orders", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: requestBody,
      }).catch((caught: unknown) => {
        const isIdempotencyConflict = caught instanceof ApiError
          && caught.status === 409
          && caught.message.includes("Khóa tạo đơn này đã được dùng với dữ liệu khác");
        if (
          caught instanceof ApiError
          && caught.status >= 400
          && caught.status < 500
          && !isIdempotencyConflict
        ) {
          idempotencyAttemptRef.current = null;
          clearStoredOrderAttempt(idempotencyKey);
        }
        throw caught;
      });
      orderCreated = true;
      idempotencyAttemptRef.current = null;
      clearStoredOrderAttempt(idempotencyKey);
      if (!persisted) {
        console.warn("Could not persist the order idempotency key; retry safety lasts only while this page remains open.");
      }
      router.push(`/orders/${created.id}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Không tạo được đơn hàng";
      const attempt = idempotencyAttemptRef.current;
      const persisted = attempt ? readStoredOrderAttempt()?.key === attempt.key : true;
      const isIdempotencyConflict = caught instanceof ApiError
        && caught.status === 409
        && caught.message.includes("Khóa tạo đơn này đã được dùng với dữ liệu khác");
      setFormError(
        isIdempotencyConflict
          ? "Khóa tạo đơn bị xung đột với dữ liệu đã gửi trước đó. Hãy kiểm tra danh sách đơn hàng trước khi tiếp tục; không tạo yêu cầu mới bằng khóa khác cho đến khi xác định được kết quả."
          : attempt && !persisted
          ? `${message} Kết quả chưa xác định; khóa yêu cầu chỉ còn trong trang hiện tại vì trình duyệt không cho phép lưu sessionStorage/localStorage. Hãy thử lại cùng nội dung và không tải lại trang.`
          : message,
      );
    } finally {
      if (!orderCreated) {
        submitLockRef.current = false;
        setSubmitting(false);
      }
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

            <label className="mt-4 flex items-start gap-2 text-[12px] text-dt-muted">
              <input
                type="checkbox"
                checked={receiverIsSender}
                onChange={(event) => setReceiverIsSender(event.target.checked)}
                className="mt-0.5 accent-dt-yellow"
              />
              <span>Người nhận là tôi. Đơn sẽ xuất hiện trong cả danh sách đơn tôi gửi và đơn tôi nhận.</span>
            </label>
            <p className="text-[11px] text-dt-muted">Đơn hàng sẽ dùng đúng địa chỉ lấy và giao bạn đã chọn; việc chọn địa chỉ khác không làm thay đổi địa chỉ mặc định trong sổ.</p>
          </Card>

          <Card>
            <CardLabel>Hàng hóa</CardLabel>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <TextField label="Tên hàng hóa" required value={form.itemName} maxLength={200} placeholder="Ví dụ: Hồ sơ hợp đồng" onChange={(event) => update("itemName", event.target.value)} />
              <TextField label="Loại hàng" value={form.itemType} maxLength={100} placeholder="Hồ sơ, quần áo..." onChange={(event) => update("itemType", event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Số lượng" type="number" min="1" max="10000" step="1" required value={form.quantity} onChange={(event) => update("quantity", event.target.value)} />
              <TextField label="Khối lượng (kg)" type="number" min="0" max="10000" step="0.01" value={form.weight} placeholder="Không bắt buộc" onChange={(event) => update("weight", event.target.value)} />
              <TextField label="Giá trị khai báo" type="number" min="0" max="999999999999.99" step="0.01" value={form.declaredValue} placeholder="Không bắt buộc" onChange={(event) => update("declaredValue", event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Chiều dài (cm)" type="number" min="0" max="1000" step="0.1" value={form.length} placeholder="Không bắt buộc" onChange={(event) => update("length", event.target.value)} />
              <TextField label="Chiều rộng (cm)" type="number" min="0" max="1000" step="0.1" value={form.width} placeholder="Không bắt buộc" onChange={(event) => update("width", event.target.value)} />
              <TextField label="Chiều cao (cm)" type="number" min="0" max="1000" step="0.1" value={form.height} placeholder="Không bắt buộc" hint="Nhập đủ 3 chiều: kiện cồng kềnh được tính cước theo khối lượng quy đổi (dài×rộng×cao/6000)." onChange={(event) => update("height", event.target.value)} />
            </div>
            <label className="mt-4 flex flex-col gap-[6px]">
              <span className="text-[11px] font-medium text-dt-muted">Ghi chú mặt hàng</span>
              <textarea value={form.itemNote} maxLength={1000} onChange={(event) => update("itemNote", event.target.value)} placeholder="Lưu ý riêng cho mặt hàng này..." rows={2} className="w-full resize-y rounded-dt border border-dt-border bg-dt-panel2 px-3 py-3 text-[13px] text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none" />
            </label>
          </Card>

          <Card>
            <CardLabel>Ghi chú</CardLabel>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[11px] font-medium text-dt-muted">Lưu ý cho đơn hàng</span>
              <textarea value={form.note} maxLength={1000} onChange={(event) => update("note", event.target.value)} placeholder="Ví dụ: Gọi trước khi giao..." rows={4} className="w-full resize-y rounded-dt border border-dt-border bg-dt-panel2 px-3 py-3 text-[13px] text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none" />
            </label>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardLabel>Dịch vụ và thanh toán</CardLabel>
            <SelectField label="Loại dịch vụ" required value={form.serviceType} onChange={(event) => update("serviceType", event.target.value)}>
              {SERVICE_OPTIONS.map((option) => <option key={option.value} value={option.value} className="bg-dt-panel2">{option.label}</option>)}
            </SelectField>
            <TextField label="COD cần thu hộ" type="number" min="0" max="999999999999.99" step="0.01" value={form.codAmount} onChange={(event) => update("codAmount", event.target.value)} hint="Để 0 nếu đơn không thu hộ" />
            <ShippingPaymentFields payer={shippingFeePayer} method={shippingPaymentMethod} onPayerChange={setShippingFeePayer} onMethodChange={setShippingPaymentMethod} fee={estimatedFee} feeNote={quote && !quote.available ? quote.message : null} availability={paymentAvailability} />
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
