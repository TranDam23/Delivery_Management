"use client";

import { Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CONTACT_TYPE_LABEL, ContactType } from "@delivery/shared";
import { AddressLocationFields } from "@/components/locations/address-location-fields";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";

interface Contact {
  id: string;
  type: ContactType;
  name: string;
  phone: string;
  email: string | null;
  default_address_id: string | null;
}

interface Address {
  id: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  ward: string | null;
  district: string | null;
  province: string | null;
  is_default: boolean;
}

interface ListResult { items: Contact[]; total: number; page: number; pageSize: number }
interface AddressesResult { contact: { id: string }; items: Address[] }

interface AddressForm { id: string | null; recipient_name: string; phone: string; address_line: string; province: string; district: string; ward: string }

const EMPTY_ADDRESS: AddressForm = { id: null, recipient_name: "", phone: "", address_line: "", province: "", district: "", ward: "" };

function addressText(address: Address): string {
  return [address.address_line, address.ward, address.district, address.province].filter(Boolean).join(", ");
}

function ContactRow({ contact, onChanged, onMessage }: { contact: Contact; onChanged: () => Promise<void>; onMessage: (message: { error?: string; notice?: string }) => void }): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: contact.name, phone: contact.phone, email: contact.email ?? "", type: contact.type });
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressForm, setAddressForm] = useState<AddressForm | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAddresses = useCallback(async (): Promise<void> => {
    try {
      const result = await apiFetch<AddressesResult>(`/api/contacts/${contact.id}/addresses`);
      setAddresses(result.items);
    } catch (caught) {
      onMessage({ error: caught instanceof Error ? caught.message : "Không tải được địa chỉ" });
    }
  }, [contact.id, onMessage]);

  useEffect(() => { if (open) void loadAddresses(); }, [open, loadAddresses]);

  async function run(action: () => Promise<unknown>, notice: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      onMessage({ notice });
      return true;
    } catch (caught) {
      onMessage({ error: caught instanceof Error ? caught.message : "Thao tác không thành công" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveContact(): Promise<void> {
    const ok = await run(() => apiFetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: form.name, phone: form.phone, email: form.email.trim() || undefined, type: form.type }),
    }), "Đã cập nhật thông tin.");
    if (ok) { setEditing(false); await onChanged(); }
  }

  async function removeContact(): Promise<void> {
    if (!window.confirm(`Xóa "${contact.name}" khỏi sổ? Người đã có trong đơn hàng sẽ không xóa được.`)) return;
    if (await run(() => apiFetch(`/api/contacts/${contact.id}`, { method: "DELETE" }), "Đã xóa người liên hệ.")) await onChanged();
  }

  async function saveAddress(): Promise<void> {
    if (!addressForm) return;
    const body = JSON.stringify({
      recipient_name: addressForm.recipient_name, phone: addressForm.phone, address_line: addressForm.address_line,
      province: addressForm.province, district: addressForm.district, ward: addressForm.ward,
    });
    const ok = await run(
      () => addressForm.id
        ? apiFetch(`/api/contacts/${contact.id}/addresses/${addressForm.id}`, { method: "PATCH", body })
        : apiFetch(`/api/contacts/${contact.id}/addresses`, { method: "POST", body }),
      addressForm.id ? "Đã cập nhật địa chỉ." : "Đã thêm địa chỉ.",
    );
    if (ok) { setAddressForm(null); await loadAddresses(); await onChanged(); }
  }

  async function removeAddress(address: Address): Promise<void> {
    if (!window.confirm("Xóa địa chỉ này? Địa chỉ đã dùng trong đơn hàng sẽ không xóa được.")) return;
    if (await run(() => apiFetch(`/api/contacts/${contact.id}/addresses/${address.id}`, { method: "DELETE" }), "Đã xóa địa chỉ.")) await loadAddresses();
  }

  return (
    <li className="rounded-dt border border-dt-border bg-dt-panel2 p-3 text-[12px]">
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Họ tên" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <TextField label="Số điện thoại" required inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          <TextField label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <SelectField label="Vai trò" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ContactType })}>
            {Object.values(ContactType).map((type) => <option key={type} value={type}>{CONTACT_TYPE_LABEL[type]}</option>)}
          </SelectField>
          <div className="flex gap-2 sm:col-span-2">
            <Button disabled={busy} onClick={() => void saveContact()}>Lưu</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setEditing(false)}>Hủy</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{contact.name} <span className="ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-dt-muted">{CONTACT_TYPE_LABEL[contact.type]}</span></p>
            <p className="text-dt-muted">{contact.phone}{contact.email ? ` · ${contact.email}` : ""}</p>
          </div>
          <Button variant="secondary" className="px-3 py-1.5 text-[11px]" onClick={() => setOpen((value) => !value)}>{open ? "Ẩn địa chỉ" : "Địa chỉ"}</Button>
          <Button variant="secondary" className="px-3 py-1.5 text-[11px]" onClick={() => setEditing(true)}><Pencil size={12} /> Sửa</Button>
          <button type="button" aria-label={`Xóa ${contact.name}`} disabled={busy} onClick={() => void removeContact()} className="text-dt-muted hover:text-red-300"><Trash2 size={14} /></button>
        </div>
      )}

      {open ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-dt-border pt-3">
          {addresses.length === 0 ? <p className="text-dt-muted">Chưa có địa chỉ nào.</p> : null}
          {addresses.map((address) => (
            <div key={address.id} className="flex flex-wrap items-center gap-3 rounded-dt bg-dt-panel px-3 py-2">
              <p className="min-w-0 flex-1">{addressText(address)}{address.is_default ? <span className="ml-2 rounded-full bg-dt-yellow/10 px-2 py-0.5 text-[10px] text-dt-yellow">Mặc định</span> : null}</p>
              <button type="button" aria-label="Sửa địa chỉ" onClick={() => setAddressForm({ id: address.id, recipient_name: address.recipient_name, phone: address.phone, address_line: address.address_line, province: address.province ?? "", district: address.district ?? "", ward: address.ward ?? "" })} className="text-dt-muted hover:text-dt-text"><Pencil size={13} /></button>
              <button type="button" aria-label="Xóa địa chỉ" disabled={busy} onClick={() => void removeAddress(address)} className="text-dt-muted hover:text-red-300"><Trash2 size={13} /></button>
            </div>
          ))}
          {addressForm ? (
            <div className="grid gap-3 rounded-dt border border-dt-yellow/40 p-3 sm:grid-cols-2">
              <TextField label="Tên người nhận tại địa chỉ" required value={addressForm.recipient_name} onChange={(event) => setAddressForm({ ...addressForm, recipient_name: event.target.value })} />
              <TextField label="Số điện thoại" required inputMode="tel" value={addressForm.phone} onChange={(event) => setAddressForm({ ...addressForm, phone: event.target.value })} />
              <div className="sm:col-span-2"><AddressLocationFields value={addressForm} onChange={(location) => setAddressForm({ ...addressForm, ...location })} /></div>
              <TextField label="Số nhà, tên đường" required wrapperClassName="sm:col-span-2" value={addressForm.address_line} onChange={(event) => setAddressForm({ ...addressForm, address_line: event.target.value })} />
              <p className="text-[11px] text-dt-muted sm:col-span-2">Sửa địa chỉ đã dùng trong đơn cũ sẽ đổi thông tin hiển thị của các đơn đó nhưng không tự lập lại tuyến; nên thêm địa chỉ mới thay vì sửa.</p>
              <div className="flex gap-2 sm:col-span-2">
                <Button disabled={busy} onClick={() => void saveAddress()}>Lưu địa chỉ</Button>
                <Button variant="secondary" disabled={busy} onClick={() => setAddressForm(null)}><X size={13} /> Hủy</Button>
              </div>
            </div>
          ) : (
            <div><Button variant="secondary" className="px-3 py-1.5 text-[11px]" onClick={() => setAddressForm({ ...EMPTY_ADDRESS, recipient_name: contact.name, phone: contact.phone })}><Plus size={12} /> Thêm địa chỉ</Button></div>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** Sổ người gửi/nhận do điều phối viên nhập khi tạo đơn hộ: tìm kiếm, sửa thông tin, quản lý địa chỉ. */
export function ContactBookPage(): React.JSX.Element {
  const [result, setResult] = useState<ListResult | null>(null);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (applied) params.set("q", applied);
      if (type) params.set("type", type);
      setResult(await apiFetch<ListResult>(`/api/contacts?${params.toString()}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được danh sách");
    } finally {
      setLoading(false);
    }
  }, [page, applied, type]);

  useEffect(() => { void load(); }, [load]);

  const handleMessage = useCallback((message: { error?: string; notice?: string }): void => {
    setError(message.error ?? null);
    setNotice(message.notice ?? null);
  }, []);

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="min-h-screen bg-dt-bg text-dt-text">
      <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 px-5 py-6 md:px-8 md:py-8">
        <PageHeader
          heading="Người gửi / người nhận"
          subtitle="Thông tin người gửi và người nhận bạn đã nhập khi tạo đơn hộ khách. Người mới được thêm tự động lúc tạo đơn."
          action={<Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={14} className={loading ? "animate-spin" : undefined} /> Tải lại</Button>}
        />
        {error ? <p role="alert" className="rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
        {notice ? <p role="status" className="rounded-dt border border-dt-green/30 bg-dt-green/10 px-4 py-3 text-[12px] text-dt-green">{notice}</p> : null}

        <form onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(query.trim()); }} className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dt-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên, số điện thoại hoặc email" aria-label="Tìm người liên hệ" className="h-[42px] w-full rounded-dt border border-dt-border bg-dt-panel2 pl-9 pr-3 text-[13px] text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none" />
          </div>
          <select aria-label="Lọc vai trò" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="h-[42px] rounded-dt border border-dt-border bg-dt-panel2 px-3 text-[13px] text-dt-text">
            <option value="">Mọi vai trò</option>
            {Object.values(ContactType).map((item) => <option key={item} value={item}>{CONTACT_TYPE_LABEL[item]}</option>)}
          </select>
          <Button type="submit">Tìm</Button>
        </form>

        <Card>
          <CardLabel>Danh sách ({result?.total ?? 0})</CardLabel>
          {loading && !result ? <p className="text-[12px] text-dt-muted">Đang tải...</p> : null}
          {result && result.items.length === 0 ? <p className="text-[12px] text-dt-muted">Chưa có người liên hệ nào. Người gửi và người nhận sẽ xuất hiện sau khi bạn tạo đơn hộ khách.</p> : null}
          <ul className="flex flex-col gap-2">
            {result?.items.map((contact) => <ContactRow key={contact.id} contact={contact} onChanged={load} onMessage={handleMessage} />)}
          </ul>
          {result && pages > 1 ? (
            <div className="flex items-center justify-between text-[12px] text-dt-muted">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</Button>
              <span>Trang {page}/{pages}</span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Sau</Button>
            </div>
          ) : null}
        </Card>
      </main>
    </div>
  );
}
