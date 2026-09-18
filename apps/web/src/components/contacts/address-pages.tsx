"use client";

import { ArrowLeft, CheckCircle2, LoaderCircle, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createAddressSchema, updateAddressSchema, type Address } from "@delivery/shared";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { AddressLocationFields } from "@/components/locations/address-location-fields";

interface ContactSummary {
  id: string;
  name: string;
  phone: string;
  default_address_id: string | null;
}

interface AddressResponse {
  contact: ContactSummary;
  items: Address[];
}

function addressText(address: Address): string {
  return [address.address_line, address.ward, address.district, address.province].filter(Boolean).join(", ");
}

export function AddressListPage({ contactId }: { contactId: string }): React.JSX.Element {
  const [result, setResult] = useState<AddressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAddresses = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setResult(await apiFetch<AddressResponse>(`/api/contacts/${encodeURIComponent(contactId)}/addresses`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được địa chỉ");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  async function handleDelete(address: Address): Promise<void> {
    if (!window.confirm(`Bạn có chắc muốn xóa địa chỉ "${addressText(address)}" không?`)) return;

    setDeletingId(address.id);
    setError(null);
    try {
      await apiFetch<{ id: string }>(`/api/contacts/${encodeURIComponent(contactId)}/addresses/${encodeURIComponent(address.id)}`, { method: "DELETE" });
      await loadAddresses();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không xóa được địa chỉ");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <Card><p className="text-[13px] text-dt-muted">Đang tải địa chỉ...</p></Card>;
  if (error && !result) return <Card><p className="text-[13px] text-dt-red">{error}</p><Link href="/contacts" className="text-[12px] text-dt-yellow hover:underline">Về sổ địa chỉ</Link></Card>;
  if (!result) return <Card><p className="text-[13px] text-dt-red">Không có dữ liệu liên hệ.</p></Card>;

  return (
    <>
      <PageHeader heading={`Địa chỉ của ${result.contact.name}`} subtitle={`Quản lý các địa chỉ dùng khi gửi hoặc nhận hàng · ${result.contact.phone}`} action={<div className="flex gap-2"><Link href="/contacts" className={buttonClassName("secondary")}><ArrowLeft size={14} /> Sổ địa chỉ</Link><Link href={`/contacts/${contactId}/addresses/new`} className={buttonClassName()}><Plus size={14} /> Thêm địa chỉ</Link></div>} />
      {error ? <p role="alert" className="rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[12px] text-red-200">{error}</p> : null}
      {result.items.length === 0 ? <Card><MapPin className="text-dt-yellow" size={18} /><p className="text-[13px]">Liên hệ này chưa có địa chỉ.</p><p className="text-[11px] text-dt-muted">Địa chỉ đầu tiên sẽ tự động được chọn làm mặc định.</p><Link href={`/contacts/${contactId}/addresses/new`} className={`${buttonClassName()} mt-2 w-fit`}><Plus size={14} /> Thêm địa chỉ đầu tiên</Link></Card> : <div className="grid max-w-[1000px] gap-4 md:grid-cols-2">{result.items.map((address) => { const isDefault = address.id === result.contact.default_address_id; return <Card key={address.id} className={isDefault ? "border-dt-yellow/40" : undefined}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><MapPin className="mt-0.5 shrink-0 text-dt-yellow" size={18} /><div><p className="text-[13px] font-medium">{address.recipient_name}</p><p className="mt-1 text-[11px] text-dt-muted">{address.phone}</p></div></div>{isDefault ? <span className="inline-flex items-center gap-1 rounded-full bg-dt-yellow/10 px-2 py-1 text-[10px] text-dt-yellow"><CheckCircle2 size={12} /> Mặc định</span> : null}</div><p className="mt-3 text-[12px] leading-5 text-dt-text">{addressText(address)}</p><div className="mt-4 flex justify-end gap-2"><Link href={`/contacts/${contactId}/addresses/${address.id}/edit`} className={buttonClassName("secondary", "px-3 py-2 text-[11px]")}><Pencil size={13} /> Sửa</Link><button type="button" onClick={() => void handleDelete(address)} disabled={deletingId === address.id} className={buttonClassName("danger", "px-3 py-2 text-[11px]")}>{deletingId === address.id ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />} Xóa</button></div></Card>; })}</div>}
    </>
  );
}

interface AddressFormState {
  recipient_name: string;
  phone: string;
  address_line: string;
  ward: string;
  district: string;
  province: string;
  is_default: boolean;
}

const INITIAL_ADDRESS: AddressFormState = { recipient_name: "", phone: "", address_line: "", ward: "", district: "", province: "", is_default: false };

export function AddressFormPage({ contactId, addressId }: { contactId: string; addressId?: string }): React.JSX.Element {
  const router = useRouter();
  const editing = Boolean(addressId);
  const [form, setForm] = useState<AddressFormState>(INITIAL_ADDRESS);
  const [contactName, setContactName] = useState("liên hệ");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadContactAndAddress(): Promise<void> {
      try {
        const result = await apiFetch<AddressResponse>(`/api/contacts/${encodeURIComponent(contactId)}/addresses`);
        if (!mounted) return;
        setContactName(result.contact.name);
        const address = addressId ? result.items.find((item) => item.id === addressId) : null;
        if (addressId && !address) {
          setError("Không tìm thấy địa chỉ cần sửa.");
        } else if (address) {
          setForm({ recipient_name: address.recipient_name, phone: address.phone, address_line: address.address_line, ward: address.ward ?? "", district: address.district ?? "", province: address.province ?? "", is_default: address.id === result.contact.default_address_id });
        } else {
          setForm((current) => ({ ...current, recipient_name: current.recipient_name || result.contact.name, phone: current.phone || result.contact.phone, is_default: result.items.length === 0 }));
        }
      } catch (caught) {
        if (mounted) setError(caught instanceof Error ? caught.message : "Không tải được thông tin địa chỉ");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadContactAndAddress();
    return () => { mounted = false; };
  }, [addressId, contactId]);

  function update(field: keyof AddressFormState, value: string | boolean): void {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const schema = editing ? updateAddressSchema : createAddressSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setError(Object.values(fieldErrors).flat()[0] ?? "Dữ liệu địa chỉ chưa hợp lệ");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const path = editing ? `/api/contacts/${encodeURIComponent(contactId)}/addresses/${encodeURIComponent(addressId ?? "")}` : `/api/contacts/${encodeURIComponent(contactId)}/addresses`;
      await apiFetch<Address>(path, { method: editing ? "PATCH" : "POST", body: JSON.stringify(parsed.data) });
      router.push(`/contacts/${contactId}/addresses`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không lưu được địa chỉ");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Card><p className="text-[13px] text-dt-muted">Đang tải thông tin địa chỉ...</p></Card>;

  return (
    <>
      <PageHeader heading={editing ? "Sửa địa chỉ" : "Thêm địa chỉ"} subtitle={`${editing ? "Cập nhật" : "Địa chỉ mới"} cho ${contactName}`} action={<Link href={`/contacts/${contactId}/addresses`} className={buttonClassName("secondary")}><ArrowLeft size={14} /> Quay lại</Link>} />
      <form onSubmit={handleSubmit} className="max-w-[900px]"><Card className="gap-4"><CardLabel>Thông tin địa chỉ</CardLabel><div className="grid gap-4 md:grid-cols-2"><TextField label="Tên người nhận" required value={form.recipient_name} onChange={(event) => update("recipient_name", event.target.value)} /><TextField label="Số điện thoại" required inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} /></div><TextField label="Địa chỉ cụ thể" required placeholder="Số nhà, tên đường" value={form.address_line} onChange={(event) => update("address_line", event.target.value)} /><AddressLocationFields value={{ province: form.province, district: form.district, ward: form.ward }} onChange={(location) => { setForm((current) => ({ ...current, ...location })); setError(null); }} /><label className="flex w-fit cursor-pointer items-center gap-2 text-[12px] text-dt-muted"><input type="checkbox" checked={form.is_default} onChange={(event) => update("is_default", event.target.checked)} className="h-3.5 w-3.5 accent-[var(--dt-yellow)]" /> Đặt làm địa chỉ mặc định</label>{editing && form.is_default ? <p className="text-[11px] text-dt-muted">Liên hệ luôn cần một địa chỉ mặc định; hệ thống sẽ giữ địa chỉ này nếu bạn không chọn địa chỉ khác.</p> : null}{error ? <p role="alert" className="rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[12px] text-red-200">{error}</p> : null}<div className="flex gap-2 pt-2"><Link href={`/contacts/${contactId}/addresses`} className={buttonClassName("secondary")}>Hủy</Link><Button type="submit" disabled={submitting}>{submitting ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Lưu địa chỉ"}</Button></div></Card></form>
    </>
  );
}

export function NewAddressPage({ contactId }: { contactId: string }): React.JSX.Element {
  return <AddressFormPage contactId={contactId} />;
}

export function EditAddressPage({ contactId, addressId }: { contactId: string; addressId: string }): React.JSX.Element {
  return <AddressFormPage contactId={contactId} addressId={addressId} />;
}
