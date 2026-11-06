"use client";

import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { VIETNAM_PROVINCES } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";
import { ZONE_LABEL } from "@/lib/shipping-fee";
import { describeQuote, type ShippingQuote } from "@/lib/use-shipping-quote";

type Service = "standard" | "express" | "same_day";
type Zone = "same_province" | "same_region" | "inter_region";

interface TariffRow { id?: string; service_type: Service; zone: Zone; base_fee: number; step_fee: number; status: "active" | "inactive" }
interface Surcharge { id: string; province: string; ward: string | null; apply_to: "DELIVERY" | "PICKUP"; surcharge_fee: number; note: string | null; status: "active" | "inactive" }
interface Settings { weightStepKg: number; volumetricDivisor: number; oversizeSideCm: number; oversizeFee: number }
interface PricingPayload { tariffs: TariffRow[]; surcharges: Surcharge[]; settings: Settings }

const SERVICE_LABEL: Record<Service, string> = { standard: "Tiêu chuẩn", express: "Hỏa tốc", same_day: "Trong ngày" };
const ZONES: Zone[] = ["same_province", "same_region", "inter_region"];
const SERVICES: Service[] = ["standard", "express", "same_day"];

function money(value: number): string {
  return `${Number(value).toLocaleString("vi-VN")}đ`;
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PricingManagementPage(): React.JSX.Element {
  const [tariffs, setTariffs] = useState<TariffRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [surcharges, setSurcharges] = useState<Surcharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ province: "", ward: "", apply_to: "DELIVERY", fee: "", note: "" });
  const [calc, setCalc] = useState({ service: "standard" as Service, pickupProvince: "", pickupWard: "", deliveryProvince: "", deliveryWard: "", weight: "1", length: "", width: "", height: "", quantity: "1" });
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<PricingPayload>("/api/shipping-pricing");
      setTariffs(payload.tariffs.map((row) => ({ ...row, base_fee: Number(row.base_fee), step_fee: Number(row.step_fee) })));
      setSurcharges(payload.surcharges.map((row) => ({ ...row, surcharge_fee: Number(row.surcharge_fee) })));
      setSettings(payload.settings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được bảng giá");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Thao tác không thành công");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function tariffOf(service: Service, zone: Zone): TariffRow | undefined {
    return tariffs.find((row) => row.service_type === service && row.zone === zone);
  }

  function updateTariff(service: Service, zone: Zone, patch: Partial<TariffRow>): void {
    setTariffs((current) => {
      const exists = current.some((row) => row.service_type === service && row.zone === zone);
      return exists
        ? current.map((row) => (row.service_type === service && row.zone === zone ? { ...row, ...patch } : row))
        : [...current, { service_type: service, zone, base_fee: 0, step_fee: 0, status: "inactive", ...patch }];
    });
  }

  async function saveTariffs(): Promise<void> {
    if (!settings) return;
    await run(
      () => apiFetch("/api/shipping-pricing", {
        method: "PUT",
        body: JSON.stringify({
          tariffs: tariffs.map(({ service_type, zone, base_fee, step_fee, status }) => ({ service_type, zone, base_fee, step_fee, status })),
          settings,
        }),
      }),
      "Đã lưu bảng giá. Đơn tạo từ bây giờ tính theo bảng giá mới.",
    );
  }

  async function addSurcharge(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const ok = await run(
      () => apiFetch("/api/shipping-pricing", {
        method: "POST",
        body: JSON.stringify({ province: form.province, ward: form.ward.trim() || null, apply_to: form.apply_to, surcharge_fee: toNumber(form.fee), note: form.note.trim() || null }),
      }),
      "Đã thêm phụ phí khu vực.",
    );
    if (ok) {
      setForm({ province: "", ward: "", apply_to: "DELIVERY", fee: "", note: "" });
      await load();
    }
  }

  async function runCalc(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setCalcError(null);
    setQuote(null);
    try {
      const positive = (value: string): number | undefined => (toNumber(value) > 0 ? toNumber(value) : undefined);
      const result = await apiFetch<ShippingQuote>("/api/shipping-quote", {
        method: "POST",
        body: JSON.stringify({
          service_type: calc.service,
          pickup_province: calc.pickupProvince || undefined,
          pickup_ward: calc.pickupWard.trim() || undefined,
          delivery_province: calc.deliveryProvince || undefined,
          delivery_ward: calc.deliveryWard.trim() || undefined,
          items: [{ quantity: Math.max(1, Math.round(toNumber(calc.quantity))), weight: positive(calc.weight), length: positive(calc.length), width: positive(calc.width), height: positive(calc.height) }],
        }),
      });
      setQuote(result);
    } catch (caught) {
      setCalcError(caught instanceof Error ? caught.message : "Không tính được cước");
    }
  }

  const provinceOptions = VIETNAM_PROVINCES.map((name) => <option key={name} value={name}>{name}</option>);

  return (
    <div className="min-h-screen bg-dt-bg text-dt-text">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 py-6 md:px-8 md:py-8">
        <PageHeader
          heading="Bảng giá vận chuyển"
          subtitle="Cước theo tuyến (nội tỉnh, nội vùng, liên vùng), cân nặng, kích thước và phụ phí theo khu vực."
          action={<Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={14} /> Tải lại</Button>}
        />
        {error ? <p role="alert" className="rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
        {notice ? <p role="status" className="rounded-dt border border-dt-green/30 bg-dt-green/10 px-4 py-3 text-[12px] text-dt-green">{notice}</p> : null}

        {loading || !settings ? <p className="text-[12px] text-dt-muted">Đang tải...</p> : (
          <>
            <Card>
              <CardLabel>Cước theo tuyến</CardLabel>
              <p className="text-[12px] text-dt-muted">Cước = cước cơ bản (đến 1 bậc cân đầu) + phụ phí mỗi bậc cân vượt quá. Bỏ chọn &quot;Áp dụng&quot; để dịch vụ không phục vụ tuyến đó.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[12px]">
                  <thead className="text-dt-muted"><tr><th className="py-2 pr-3">Dịch vụ</th><th className="pr-3">Tuyến</th><th className="pr-3">Cước cơ bản (đ)</th><th className="pr-3">Mỗi bậc cân vượt (đ)</th><th>Áp dụng</th></tr></thead>
                  <tbody>
                    {SERVICES.flatMap((service) => ZONES.map((zone) => {
                      const row = tariffOf(service, zone);
                      return (
                        <tr key={`${service}-${zone}`} className="border-t border-dt-border">
                          <td className="py-2 pr-3">{SERVICE_LABEL[service]}</td>
                          <td className="pr-3">{ZONE_LABEL[zone]}</td>
                          <td className="pr-3"><input aria-label={`Cước cơ bản ${SERVICE_LABEL[service]} ${ZONE_LABEL[zone]}`} inputMode="numeric" value={row?.base_fee ?? 0} onChange={(event) => updateTariff(service, zone, { base_fee: toNumber(event.target.value) })} className="h-[34px] w-[120px] rounded-dt border border-dt-border bg-dt-panel2 px-2 text-dt-text focus:border-dt-yellow focus:outline-none" /></td>
                          <td className="pr-3"><input aria-label={`Phụ phí bậc cân ${SERVICE_LABEL[service]} ${ZONE_LABEL[zone]}`} inputMode="numeric" value={row?.step_fee ?? 0} onChange={(event) => updateTariff(service, zone, { step_fee: toNumber(event.target.value) })} className="h-[34px] w-[120px] rounded-dt border border-dt-border bg-dt-panel2 px-2 text-dt-text focus:border-dt-yellow focus:outline-none" /></td>
                          <td><input type="checkbox" aria-label={`Áp dụng ${SERVICE_LABEL[service]} ${ZONE_LABEL[zone]}`} checked={row?.status === "active"} onChange={(event) => updateTariff(service, zone, { status: event.target.checked ? "active" : "inactive" })} /></td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>

              <CardLabel>Cân nặng và kích thước</CardLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TextField label="Bậc cân nặng (kg)" inputMode="decimal" value={settings.weightStepKg} onChange={(event) => setSettings({ ...settings, weightStepKg: toNumber(event.target.value) })} hint="VD 0,5 kg mỗi bậc" />
                <TextField label="Hệ số quy đổi thể tích" inputMode="numeric" value={settings.volumetricDivisor} onChange={(event) => setSettings({ ...settings, volumetricDivisor: toNumber(event.target.value) })} hint="Dài×Rộng×Cao (cm³) ÷ hệ số = kg" />
                <TextField label="Ngưỡng cồng kềnh (cm)" inputMode="numeric" value={settings.oversizeSideCm} onChange={(event) => setSettings({ ...settings, oversizeSideCm: toNumber(event.target.value) })} hint="Cạnh dài nhất ≥ ngưỡng; 0 = tắt" />
                <TextField label="Phụ phí cồng kềnh (đ)" inputMode="numeric" value={settings.oversizeFee} onChange={(event) => setSettings({ ...settings, oversizeFee: toNumber(event.target.value) })} hint="Tính một lần cho mỗi đơn" />
              </div>
              <div><Button disabled={busy} onClick={() => void saveTariffs()}><Save size={14} /> Lưu bảng giá</Button></div>
            </Card>

            <Card>
              <CardLabel>Phụ phí theo khu vực ({surcharges.length})</CardLabel>
              <p className="text-[12px] text-dt-muted">Cộng thêm khi lấy hoặc giao hàng tại khu vực này (vùng xa, đảo...). Để trống phường/xã để áp dụng cho cả tỉnh; cấu hình theo phường/xã được ưu tiên hơn cấu hình theo tỉnh.</p>
              <ul className="flex flex-col gap-2 text-[12px]">
                {surcharges.length === 0 ? <li className="text-dt-muted">Chưa có phụ phí khu vực nào.</li> : null}
                {surcharges.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-dt border border-dt-border bg-dt-panel2 px-3 py-2">
                    <span className={`min-w-0 flex-1 ${item.status === "inactive" ? "text-dt-muted line-through" : ""}`}>
                      {item.apply_to === "DELIVERY" ? "Giao" : "Lấy"}: {item.ward ? `${item.ward}, ` : ""}{item.province}{item.note ? ` · ${item.note}` : ""}
                    </span>
                    <input aria-label={`Phụ phí ${item.province}`} inputMode="numeric" defaultValue={item.surcharge_fee} onBlur={(event) => { const next = toNumber(event.target.value); if (next !== item.surcharge_fee) void run(() => apiFetch(`/api/shipping-pricing/surcharges/${item.id}`, { method: "PATCH", body: JSON.stringify({ surcharge_fee: next }) }), "Đã cập nhật phụ phí.").then(() => load()); }} className="h-[32px] w-[110px] rounded-dt border border-dt-border bg-dt-panel px-2 text-dt-text focus:border-dt-yellow focus:outline-none" />
                    <span className="text-dt-muted">{money(item.surcharge_fee)}</span>
                    <button type="button" disabled={busy} onClick={() => void run(() => apiFetch(`/api/shipping-pricing/surcharges/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: item.status === "active" ? "inactive" : "active" }) }), "Đã đổi trạng thái phụ phí.").then(() => load())} className={`rounded-full px-2 py-0.5 text-[10px] ${item.status === "active" ? "bg-dt-green/10 text-dt-green" : "bg-white/5 text-dt-muted"}`}>{item.status === "active" ? "Áp dụng" : "Tạm dừng"}</button>
                    <button type="button" aria-label="Xóa phụ phí" disabled={busy} onClick={() => { if (window.confirm("Xóa phụ phí này?")) void run(() => apiFetch(`/api/shipping-pricing/surcharges/${item.id}`, { method: "DELETE" }), "Đã xóa phụ phí.").then(() => load()); }} className="text-dt-muted hover:text-red-300"><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
              <form onSubmit={(event) => void addSurcharge(event)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <SelectField label="Tỉnh/Thành phố" required value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} wrapperClassName="lg:col-span-2"><option value="">— Chọn —</option>{provinceOptions}</SelectField>
                <TextField label="Phường/Xã (tuỳ chọn)" value={form.ward} onChange={(event) => setForm({ ...form, ward: event.target.value })} />
                <SelectField label="Áp dụng khi" value={form.apply_to} onChange={(event) => setForm({ ...form, apply_to: event.target.value })}><option value="DELIVERY">Giao hàng</option><option value="PICKUP">Lấy hàng</option></SelectField>
                <TextField label="Phụ phí (đ)" required inputMode="numeric" value={form.fee} onChange={(event) => setForm({ ...form, fee: event.target.value })} />
                <div className="flex items-end"><Button type="submit" disabled={busy || !form.province || !form.fee} className="w-full"><Plus size={14} /> Thêm</Button></div>
                <TextField label="Ghi chú (tuỳ chọn)" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} wrapperClassName="sm:col-span-2 lg:col-span-6" maxLength={200} />
              </form>
            </Card>

            <Card>
              <CardLabel>Tính thử cước</CardLabel>
              <form onSubmit={(event) => void runCalc(event)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField label="Dịch vụ" value={calc.service} onChange={(event) => setCalc({ ...calc, service: event.target.value as Service })}>{SERVICES.map((service) => <option key={service} value={service}>{SERVICE_LABEL[service]}</option>)}</SelectField>
                <SelectField label="Tỉnh lấy hàng" value={calc.pickupProvince} onChange={(event) => setCalc({ ...calc, pickupProvince: event.target.value })}><option value="">— Chọn —</option>{provinceOptions}</SelectField>
                <SelectField label="Tỉnh giao hàng" value={calc.deliveryProvince} onChange={(event) => setCalc({ ...calc, deliveryProvince: event.target.value })}><option value="">— Chọn —</option>{provinceOptions}</SelectField>
                <TextField label="Số lượng" inputMode="numeric" value={calc.quantity} onChange={(event) => setCalc({ ...calc, quantity: event.target.value })} />
                <TextField label="Phường/xã lấy (tuỳ chọn)" value={calc.pickupWard} onChange={(event) => setCalc({ ...calc, pickupWard: event.target.value })} />
                <TextField label="Phường/xã giao (tuỳ chọn)" value={calc.deliveryWard} onChange={(event) => setCalc({ ...calc, deliveryWard: event.target.value })} />
                <TextField label="Cân nặng (kg)" inputMode="decimal" value={calc.weight} onChange={(event) => setCalc({ ...calc, weight: event.target.value })} />
                <div className="grid grid-cols-3 gap-2">
                  <TextField label="Dài (cm)" inputMode="decimal" value={calc.length} onChange={(event) => setCalc({ ...calc, length: event.target.value })} />
                  <TextField label="Rộng (cm)" inputMode="decimal" value={calc.width} onChange={(event) => setCalc({ ...calc, width: event.target.value })} />
                  <TextField label="Cao (cm)" inputMode="decimal" value={calc.height} onChange={(event) => setCalc({ ...calc, height: event.target.value })} />
                </div>
                <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={!calc.pickupProvince || !calc.deliveryProvince}>Tính cước</Button></div>
              </form>
              {calcError ? <p role="alert" className="text-[12px] text-red-200">{calcError}</p> : null}
              {quote ? (
                <div className="rounded-dt border border-dt-yellow/25 bg-dt-yellow/5 p-3 text-[12px]">
                  {quote.fee === null
                    ? <p className="text-dt-red">{quote.message ?? "Không áp dụng cho tuyến này."}</p>
                    : <>
                        <p>Tuyến: <strong>{quote.zone ? ZONE_LABEL[quote.zone] : "—"}</strong> · Cước: <strong className="text-dt-yellow">{money(quote.fee)}</strong></p>
                        <p className="mt-1 text-dt-muted">{describeQuote(quote)}</p>
                        {quote.breakdown?.areaSurchargeNotes.length ? <p className="mt-1 text-dt-muted">Phụ phí khu vực: {quote.breakdown.areaSurchargeNotes.join("; ")}</p> : null}
                      </>}
                </div>
              ) : null}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
