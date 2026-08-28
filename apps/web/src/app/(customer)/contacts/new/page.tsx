"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONTACT_TYPE_LABEL, ContactType, type Contact } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { createContactSchema } from "@/lib/validation/contact";

type FieldErrors = Partial<Record<"name" | "phone" | "email" | "type", string>>;

const INITIAL_FORM = {
  name: "",
  phone: "",
  email: "",
  type: ContactType.SENDER as ContactType,
};

export default function NewContactPage(): React.JSX.Element {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof INITIAL_FORM, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    // Dung chinh schema ma API dung, de loi hien o form khop voi loi server tra ve.
    const parsed = createContactSchema.safeParse(form);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        name: flat.name?.[0],
        phone: flat.phone?.[0],
        email: flat.email?.[0],
        type: flat.type?.[0],
      });
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      await apiFetch<Contact>("/api/contacts", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      router.push("/contacts");
      router.refresh();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Không lưu được liên hệ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        heading="Thêm người gửi / người nhận"
        subtitle="Thêm liên hệ để dùng lại trong các đơn hàng."
      />

      <form onSubmit={handleSubmit} className="max-w-[900px]">
        <Card className="gap-4">
          <CardLabel>Thông tin liên hệ</CardLabel>

          <div className="flex flex-wrap gap-4">
            <TextField
              label="Họ tên"
              required
              placeholder="Nhập họ tên"
              autoComplete="name"
              value={form.name}
              error={fieldErrors.name}
              onChange={(event) => update("name", event.target.value)}
              wrapperClassName="min-w-[280px] flex-1"
            />
            <TextField
              label="Số điện thoại"
              required
              placeholder="Nhập số điện thoại"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              error={fieldErrors.phone}
              hint="10 chữ số, bắt đầu bằng 0"
              onChange={(event) => update("phone", event.target.value)}
              wrapperClassName="min-w-[280px] flex-1"
            />
          </div>

          <TextField
            label="Email"
            type="email"
            placeholder="Nhập email"
            autoComplete="email"
            value={form.email}
            error={fieldErrors.email}
            hint="Không bắt buộc"
            onChange={(event) => update("email", event.target.value)}
          />

          <SelectField
            label="Vai trò"
            required
            value={form.type}
            error={fieldErrors.type}
            hint="Chọn Cả hai nếu người này vừa gửi vừa nhận hàng"
            onChange={(event) => update("type", event.target.value)}
            wrapperClassName="max-w-[400px]"
          >
            {Object.values(ContactType).map((type) => (
              <option key={type} value={type} className="bg-dt-panel2">
                {CONTACT_TYPE_LABEL[type]}
              </option>
            ))}
          </SelectField>

          <p className="text-[11px] text-dt-muted">
            Địa chỉ của liên hệ được thêm ở màn chi tiết liên hệ (chức năng Thêm địa chỉ).
          </p>

          {formError ? <p className="text-[12px] text-dt-red">{formError}</p> : null}

          <div className="flex gap-[10px] pt-2">
            <Link href="/contacts" className={buttonClassName("secondary")}>
              Hủy
            </Link>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Đang lưu..." : "Lưu liên hệ"}
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}
