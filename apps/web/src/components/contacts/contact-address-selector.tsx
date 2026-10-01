"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Address } from "@delivery/shared";
import { SelectField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";

interface ContactAddressResponse {
  contact: {
    id: string;
    name: string;
    default_address_id: string | null;
  };
  items: Address[];
}

interface ContactAddressSelectorProps {
  contactId: string;
  roleLabel: string;
  onSelect: (address: Address | null) => void;
}

function formatAddress(address: Address): string {
  return [address.address_line, address.ward, address.district, address.province]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

/** Chọn một trong các địa chỉ đã lưu của contact khi tạo đơn hàng. */
export function ContactAddressSelector({
  contactId,
  roleLabel,
  onSelect,
}: ContactAddressSelectorProps): React.JSX.Element {
  const [result, setResult] = useState<ContactAddressResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setResult(null);
    setSelectedId("");
    setLoading(true);
    setError(null);
    onSelect(null);

    apiFetch<ContactAddressResponse>(`/api/contacts/${encodeURIComponent(contactId)}/addresses`)
      .then((data) => {
        if (!mounted) return;
        setResult(data);
        const initial = data.items.find((address) => address.id === data.contact.default_address_id)
          ?? data.items.find((address) => address.is_default)
          ?? data.items[0]
          ?? null;
        setSelectedId(initial?.id ?? "");
        onSelect(initial);
      })
      .catch((caught) => {
        if (!mounted) return;
        setError(caught instanceof Error ? caught.message : "Không tải được địa chỉ trong sổ");
        onSelect(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [contactId, onSelect]);

  const selectedAddress = result?.items.find((address) => address.id === selectedId) ?? null;

  function chooseAddress(addressId: string): void {
    setSelectedId(addressId);
    onSelect(result?.items.find((address) => address.id === addressId) ?? null);
  }

  return (
    <div className="space-y-2">
      <SelectField
        label={`Địa chỉ ${roleLabel} trong sổ`}
        required
        value={selectedId}
        disabled={loading || !result?.items.length}
        onChange={(event) => chooseAddress(event.target.value)}
        hint={loading ? "Đang tải địa chỉ..." : undefined}
      >
        <option value="" className="bg-dt-panel2">{loading ? "Đang tải..." : "Chọn địa chỉ"}</option>
        {result?.items.map((address) => (
          <option key={address.id} value={address.id} className="bg-dt-panel2">
            {formatAddress(address)}{address.id === result.contact.default_address_id ? " · Mặc định" : ""}
          </option>
        ))}
      </SelectField>

      {error ? <p role="alert" className="text-[11px] text-dt-red">{error}</p> : null}

      {selectedAddress ? (
        <div className="rounded-md border border-dt-border bg-dt-panel2 p-3">
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-dt-muted">
            <MapPin size={13} className="text-dt-yellow" /> Địa chỉ {roleLabel}
          </p>
          <p className="mt-2 text-[12px] font-medium">{selectedAddress.recipient_name}</p>
          <p className="mt-1 text-[11px] leading-5 text-dt-muted">{formatAddress(selectedAddress)}</p>
          <p className="mt-1 text-[11px] text-dt-muted">{selectedAddress.phone}</p>
        </div>
      ) : !loading && !error ? (
        <div className="rounded-md border border-dt-border bg-dt-panel2 p-3 text-[11px] leading-5 text-dt-muted">
          Liên hệ này chưa có địa chỉ. <Link href={`/contacts/${encodeURIComponent(contactId)}/addresses/new`} className="text-dt-yellow hover:underline">Thêm địa chỉ</Link>
        </div>
      ) : null}

      {result?.items.length ? (
        <Link href={`/contacts/${encodeURIComponent(contactId)}/addresses`} className="inline-block text-[10px] text-dt-yellow hover:underline">
          Quản lý sổ địa chỉ
        </Link>
      ) : null}
    </div>
  );
}
