"use client";

import { LoaderCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ContactWithDefaultAddress, Paginated } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { ContactTypeBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, apiFetch } from "@/lib/api-client";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default function ContactListPage(): React.JSX.Element {
  const [contacts, setContacts] = useState<ContactWithDefaultAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await apiFetch<Paginated<ContactWithDefaultAddress>>(
        "/api/contacts?pageSize=50",
      );
      setContacts(page.items);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setNeedLogin(true);
      } else {
        setError(caught instanceof Error ? caught.message : "Không tải được sổ địa chỉ");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  async function handleDelete(contact: ContactWithDefaultAddress): Promise<void> {
    if (!window.confirm(`Bạn có chắc muốn xóa liên hệ "${contact.name}" không?`)) return;

    setDeletingId(contact.id);
    setError(null);
    try {
      await apiFetch<{ id: string }>(`/api/contacts/${encodeURIComponent(contact.id)}`, { method: "DELETE" });
      setContacts((current) => current.filter((item) => item.id !== contact.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không xóa được liên hệ");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        heading="Sổ địa chỉ"
        subtitle="Quản lý thông tin người gửi và người nhận thường dùng."
        action={
          <Link href="/contacts/new" className={buttonClassName()}>
            Thêm liên hệ
          </Link>
        }
      />

      {needLogin ? (
        <Card>
          <p className="text-[13px]">Phiên đăng nhập đã hết hạn hoặc bạn chưa đăng nhập.</p>
          <p className="text-[12px] text-dt-muted">
            Đăng nhập qua <code className="text-dt-yellow">POST /api/auth/login</code> và lưu token
            vào localStorage với khoá <code className="text-dt-yellow">delivertrust_token</code>.
            Màn đăng nhập thuộc nhóm chức năng Tài khoản.
          </p>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <p className="text-[13px] text-dt-red">{error}</p>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <p className="text-[13px] text-dt-muted">Đang tải sổ địa chỉ...</p>
        </Card>
      ) : null}

      {!loading && !needLogin && !error && contacts.length === 0 ? (
        <Card>
          <p className="text-[13px]">Sổ địa chỉ còn trống.</p>
          <p className="text-[12px] text-dt-muted">
            Thêm người gửi hoặc người nhận để dùng lại khi tạo đơn hàng.
          </p>
        </Card>
      ) : null}

      {contacts.length > 0 ? (
        <div className="overflow-x-auto rounded-[9px] border border-dt-border">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="h-[46px] bg-dt-panel2 text-[10px] uppercase tracking-wide text-dt-muted">
                <th className="px-[10px] font-medium">Họ tên</th>
                <th className="px-[10px] font-medium">Vai trò</th>
                <th className="px-[10px] font-medium">Số điện thoại</th>
                <th className="px-[10px] font-medium">Email</th>
                <th className="px-[10px] font-medium">Địa chỉ</th>
                <th className="px-[10px] font-medium">Cập nhật</th>
                <th className="px-[10px] text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact, index) => (
                <tr
                  key={contact.id}
                  className={index % 2 === 0 ? "h-[50px] bg-dt-panel" : "h-[50px] bg-dt-panel2"}
                >
                  <td className="px-[10px] text-[12px]">{contact.name}</td>
                  <td className="px-[10px]">
                    <ContactTypeBadge type={contact.type} />
                  </td>
                  <td className="px-[10px] text-[12px]">{contact.phone}</td>
                  <td className="px-[10px] text-[12px] text-dt-muted">{contact.email ?? "—"}</td>
                  <td className="px-[10px]">
                    <Link href={`/contacts/${contact.id}/addresses`} className="text-[11px] text-dt-yellow hover:underline">
                      {contact.default_address ? "Xem địa chỉ" : "Thêm địa chỉ"}
                    </Link>
                  </td>
                  <td className="px-[10px] text-[12px] text-dt-muted">
                    {formatDate(contact.updated_at)}
                  </td>
                  <td className="px-[10px] text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        href={`/contacts/${contact.id}/edit`}
                        aria-label={`Sửa ${contact.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dt-border text-dt-muted hover:border-dt-yellow/50 hover:text-dt-yellow"
                      >
                        <Pencil size={14} />
                      </Link>
                      <button
                        type="button"
                        aria-label={`Xóa ${contact.name}`}
                        onClick={() => void handleDelete(contact)}
                        disabled={deletingId === contact.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-dt-border text-dt-muted hover:border-dt-red/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === contact.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
