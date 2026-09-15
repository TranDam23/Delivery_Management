"use client";

import { ArrowLeft, CheckCircle2, MapPin, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  canBeReceiver,
  canBeSender,
  type ContactWithDefaultAddress,
  type Paginated,
} from "@delivery/shared";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { addressText } from "@/lib/order-ui";

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

export function NewOrderPage(): React.JSX.Element {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
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
  const sender = contacts.find((contact) => contact.id === form.senderId);
  const receiver = contacts.find((contact) => contact.id === form.receiverId);
  const weight = numericValue(form.weight);
  const baseFee = form.serviceType === "express" ? 50000 : form.serviceType === "same_day" ? 70000 : 30000;
  const estimatedFee = baseFee + Math.max(0, weight - 1) * 5000;

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

    if (!sender || !receiver) {
      setFormError("Vui lòng chọn người gửi và người nhận trong sổ địa chỉ.");
      return;
    }
    if (!sender.default_address || !receiver.default_address) {
      setFormError("Người gửi và người nhận phải có địa chỉ mặc định trước khi tạo đơn.");
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
      const created = await apiFetch<{ id: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          sender_id: sender.id,
          receiver_id: receiver.id,
          pickup_address_id: sender.default_address.id,
          delivery_address_id: receiver.default_address.id,
          service_type: form.serviceType,
          cod_amount: codAmount,
          total_fee: estimatedFee,
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
        subtitle="Chọn liên hệ trong sổ địa chỉ để tạo một đơn gửi và theo dõi xuyên suốt hành trình."
        action={<Link href="/customer" className={buttonClassName("secondary")}><ArrowLeft size={14} /> Về tổng quan</Link>}
      />

      {contacts.length === 0 && !loadingContacts ? (
        <Card className="border-dt-yellow/30 bg-dt-yellow/5">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 shrink-0 text-dt-yellow" size={18} />
            <div>
              <p className="text-[13px] font-medium">Sổ địa chỉ chưa có liên hệ</p>
              <p className="mt-1 text-[12px] leading-5 text-dt-muted">Thêm người gửi/người nhận và địa chỉ mặc định trước khi tạo đơn.</p>
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
              <SelectField
                label="Người gửi"
                required
                value={form.senderId}
                disabled={loadingContacts || senderContacts.length === 0}
                onChange={(event) => update("senderId", event.target.value)}
                hint="Liên hệ phải có vai trò Người gửi hoặc Cả hai"
              >
                <option value="" className="bg-dt-panel2">Chọn người gửi</option>
                {senderContacts.map((contact) => (
                  <option key={contact.id} value={contact.id} className="bg-dt-panel2">
                    {contact.name} · {contact.phone}{contact.default_address ? "" : " (chưa có địa chỉ)"}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Người nhận"
                required
                value={form.receiverId}
                disabled={loadingContacts || receiverContacts.length === 0}
                onChange={(event) => update("receiverId", event.target.value)}
                hint="Liên hệ phải có vai trò Người nhận hoặc Cả hai"
              >
                <option value="" className="bg-dt-panel2">Chọn người nhận</option>
                {receiverContacts.map((contact) => (
                  <option key={contact.id} value={contact.id} className="bg-dt-panel2">
                    {contact.name} · {contact.phone}{contact.default_address ? "" : " (chưa có địa chỉ)"}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-dt-border bg-dt-panel2 p-3">
                <p className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-dt-muted"><MapPin size={13} className="text-dt-yellow" /> Địa chỉ lấy hàng</p>
                <p className="mt-2 text-[12px] font-medium">{sender?.default_address?.recipient_name ?? "Chưa chọn"}</p>
                <p className="mt-1 text-[11px] leading-5 text-dt-muted">{addressText(sender?.default_address ?? null)}</p>
              </div>
              <div className="rounded-md border border-dt-border bg-dt-panel2 p-3">
                <p className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-dt-muted"><MapPin size={13} className="text-sky-300" /> Địa chỉ giao hàng</p>
                <p className="mt-2 text-[12px] font-medium">{receiver?.default_address?.recipient_name ?? "Chưa chọn"}</p>
                <p className="mt-1 text-[11px] leading-5 text-dt-muted">{addressText(receiver?.default_address ?? null)}</p>
              </div>
            </div>
            <p className="text-[11px] text-dt-muted">Muốn dùng địa chỉ khác? Cập nhật địa chỉ mặc định trong <Link href="/contacts" className="text-dt-yellow hover:underline">Sổ địa chỉ</Link>.</p>
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
            <div className="rounded-md border border-dt-yellow/25 bg-dt-yellow/5 p-3">
              <div className="flex items-center justify-between gap-3 text-[12px]"><span className="text-dt-muted">Phí giao dự kiến</span><strong className="text-dt-yellow">{estimatedFee.toLocaleString("vi-VN")}đ</strong></div>
              <p className="mt-1 text-[10px] leading-4 text-dt-muted">Phí thực tế có thể được điều chỉnh theo quy định vận hành.</p>
            </div>
          </Card>

          <Card className="border-dt-green/25 bg-dt-green/5">
            <div className="flex items-start gap-3"><Truck className="mt-0.5 shrink-0 text-dt-green" size={18} /><div><p className="text-[12px] font-medium">Mã vận đơn tự động</p><p className="mt-1 text-[11px] leading-5 text-dt-muted">Sau khi tạo, hệ thống sinh mã vận đơn và QR để bạn theo dõi đơn.</p></div></div>
          </Card>

          {formError ? <p role="alert" className="rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[12px] leading-5 text-red-200">{formError}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Link href="/customer" className={buttonClassName("secondary")}>Hủy</Link>
            <Button type="submit" disabled={submitting || loadingContacts || contacts.length === 0}>
              <CheckCircle2 size={15} />
              {submitting ? "Đang tạo đơn..." : "Tạo đơn hàng"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

