"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { SHIPPER_TYPE_LABEL, type ShipperType } from "@/lib/shipper-ui";

interface ShipperProfile {
  shipper_type: ShipperType;
  daily_assignment_limit: number | null;
  default_limit: number;
  effective_limit: number;
  assigned_today: number;
}

/** Cấu hình shipper (Admin): lấy hàng / giao hàng riêng và giới hạn số đơn phân công mỗi ngày. */
export function ShipperProfileCard({ userId }: { userId: string }): React.JSX.Element {
  const [profile, setProfile] = useState<ShipperProfile | null>(null);
  const [type, setType] = useState<ShipperType>("BOTH");
  const [limit, setLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((next: ShipperProfile): void => {
    setProfile(next);
    setType(next.shipper_type);
    setLimit(next.daily_assignment_limit === null ? "" : String(next.daily_assignment_limit));
  }, []);

  useEffect(() => {
    let active = true;
    void apiFetch<ShipperProfile>(`/api/admin/users/${userId}/shipper-profile`)
      .then((result) => { if (active) apply(result); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Không tải được cấu hình shipper"); });
    return () => { active = false; };
  }, [userId, apply]);

  async function save(): Promise<void> {
    const parsedLimit = limit.trim() === "" ? null : Number(limit);
    if (parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500)) {
      setError("Giới hạn đơn mỗi ngày phải là số nguyên từ 1 đến 500, hoặc để trống để dùng mặc định.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      apply(await apiFetch<ShipperProfile>(`/api/admin/users/${userId}/shipper-profile`, {
        method: "PATCH",
        body: JSON.stringify({ shipper_type: type, daily_assignment_limit: parsedLimit }),
      }));
      setNotice("Đã lưu cấu hình shipper.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không lưu được cấu hình shipper");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-5">
      <CardLabel>Cấu hình shipper</CardLabel>
      {error ? <p role="alert" className="rounded-dt border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[12px] text-red-200">{error}</p> : null}
      {notice ? <p role="status" className="rounded-dt border border-dt-green/30 bg-dt-green/10 px-3 py-2 text-[12px] text-dt-green">{notice}</p> : null}
      {profile ? (
        <>
          <p className="text-[12px] text-dt-muted">
            Hôm nay đã phân công <strong className="text-dt-text">{profile.assigned_today}/{profile.effective_limit}</strong> đơn.
            {profile.daily_assignment_limit === null ? ` Đang dùng giới hạn mặc định của hệ thống (${profile.default_limit} đơn mỗi ngày).` : " Đang dùng giới hạn riêng của shipper này."}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="Loại shipper" value={type} onChange={(event) => setType(event.target.value as ShipperType)} hint="Shipper lấy hàng chỉ nhận chặng lấy hàng, shipper giao hàng chỉ nhận chặng giao hàng. Chọn cả hai để nhận cả hai loại chặng.">
              {(Object.keys(SHIPPER_TYPE_LABEL) as ShipperType[]).map((key) => <option key={key} value={key}>{SHIPPER_TYPE_LABEL[key]}</option>)}
            </SelectField>
            <TextField label="Giới hạn đơn mỗi ngày" type="number" min="1" max="500" step="1" value={limit} placeholder={`Mặc định ${profile.default_limit}`} onChange={(event) => setLimit(event.target.value)} hint="Để trống để dùng mặc định. Ngày tính theo giờ Việt Nam." />
          </div>
          <div><Button disabled={saving} onClick={() => void save()}>{saving ? "Đang lưu..." : "Lưu cấu hình"}</Button></div>
        </>
      ) : !error ? <p className="text-[12px] text-dt-muted">Đang tải...</p> : null}
    </Card>
  );
}
