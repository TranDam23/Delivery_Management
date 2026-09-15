"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CONTACT_TYPE_LABEL,
  ContactType,
  createContactSchema,
  updateContactSchema,
  type ContactWithDefaultAddress,
} from "@delivery/shared";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";

interface ContactFormState {
  name: string;
  phone: string;
  email: string;
  type: ContactType;
}

const INITIAL_FORM: ContactFormState = {
  name: "",
  phone: "",
  email: "",
  type: ContactType.BOTH,
};

export function ContactFormPage({ contactId }: { contactId?: string }): React.JSX.Element {
  const router = useRouter();
  const editing = Boolean(contactId);
  const [form, setForm] = useState<ContactFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(editing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) return;
    const id = contactId;
    let mounted = true;
    async function loadContact(): Promise<void> {
      try {
        const contact = await apiFetch<ContactWithDefaultAddress>(`/api/contacts/${encodeURIComponent(id)}`);
        if (!mounted) return;
        setForm({ name: contact.name, phone: contact.phone, email: contact.email ?? "", type: contact.type });
      } catch (caught) {
        if (mounted) setError(caught instanceof Error ? caught.message : "Không tải được thông tin liên hệ");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadContact();
    return () => {
      mounted = false;
    };
  }, [contactId]);

  function update(field: keyof ContactFormState, value: string): void {
    setForm((current) => ({ ...current, [field]: field === "type" ? (value as ContactType) : value }));
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = (editing ? updateContactSchema : createContactSchema).safeParse(form);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setError(Object.values(fieldErrors).flat()[0] ?? "Thông tin liên hệ chưa hợp lệ");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiFetch<ContactWithDefaultAddress>(
        editing ? `/api/contacts/${encodeURIComponent(contactId ?? "")}` : "/api/contacts",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(parsed.data),
        },
      );
      router.push("/contacts");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không lưu được liên hệ");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Card><p className="text-[13px] text-dt-muted">Đang tải thông tin liên hệ...</p></Card>;

  return (
    <>
      <PageHeader
        heading={editing ? "Sửa liên hệ" : "Thêm người gửi / người nhận"}
        subtitle={editing ? "Cập nhật thông tin trong sổ địa chỉ." : "Thêm liên hệ để dùng lại trong các đơn hàng."}
        action={<Link href="/contacts" className={buttonClassName("secondary")}><ArrowLeft size={14} /> Sổ địa chỉ</Link>}
      />
      <form onSubmit={handleSubmit} className="max-w-[900px]"><Card className="gap-4"><CardLabel>Thông tin liên hệ</CardLabel><div className="flex flex-wrap gap-4"><TextField label="Họ tên" required placeholder="Nhập họ tên" autoComplete="name" value={form.name} onChange={(event) => update("name", event.target.value)} wrapperClassName="min-w-[280px] flex-1" /><TextField label="Số điện thoại" required placeholder="Nhập số điện thoại" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} hint="10 chữ số, bắt đầu bằng 0" wrapperClassName="min-w-[280px] flex-1" /></div><TextField label="Email" type="email" placeholder="Nhập email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} hint="Không bắt buộc" /><SelectField label="Vai trò" required value={form.type} onChange={(event) => update("type", event.target.value)} hint="Chọn Cả hai nếu người này vừa gửi vừa nhận hàng" wrapperClassName="max-w-[400px]">{Object.values(ContactType).map((type) => <option key={type} value={type} className="bg-dt-panel2">{CONTACT_TYPE_LABEL[type]}</option>)}</SelectField><p className="text-[11px] text-dt-muted">Địa chỉ của liên hệ được quản lý riêng trong màn Sổ địa chỉ.</p>{error ? <p role="alert" className="rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[12px] text-red-200">{error}</p> : null}<div className="flex gap-2 pt-2"><Link href="/contacts" className={buttonClassName("secondary")}>Hủy</Link><Button type="submit" disabled={submitting}>{submitting ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Lưu liên hệ"}</Button></div></Card></form>
    </>
  );
}
