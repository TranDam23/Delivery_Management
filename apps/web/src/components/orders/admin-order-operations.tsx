"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BlockchainEventType,
  OrderStatusCode,
  ShipmentLegStatusCode,
  ShipmentLegType,
} from "@delivery/shared";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/order-ui";
import { legStatusLabel, legTypeLabel } from "@/lib/shipment-routing";
import { ProofPhotoInput } from "@/components/delivery/proof-photo-input";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";

interface StaffOption {
  id: string;
  full_name: string;
  phone: string | null;
  warehouse_id: string | null;
  warehouse: { code: string; name: string } | null;
}

interface RouteLeg {
  id: string;
  order_id: string;
  sequence_no: number;
  leg_type: ShipmentLegType;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  assigned_staff_id: string | null;
  assigned_staff: StaffOption | null;
  delivery_id: string | null;
  status: ShipmentLegStatusCode;
  attempt_no: number;
  is_return: boolean;
  updated_at: string;
}

interface RouteItem {
  order: { id: string; order_statuses: { code: string } | null };
  legs: RouteLeg[];
}

interface AdminOrderOperationsProps {
  orderId: string;
  onChanged: () => void;
}

interface StatusAction {
  code: BlockchainEventType;
  label: string;
}

const PICKUP_WAITING_ORDER_STATUSES: string[] = [
  OrderStatusCode.CREATED,
  OrderStatusCode.PENDING_ASSIGNMENT,
  OrderStatusCode.ASSIGNED,
];
const LAST_MILE_READY_ORDER_STATUSES: string[] = [
  OrderStatusCode.IN_WAREHOUSE,
  OrderStatusCode.IN_TRANSIT,
  OrderStatusCode.REDELIVERY,
];

function statusActions(leg: RouteLeg, orderStatus: string): StatusAction[] {
  if (!leg.delivery_id) return [];
  if (
    leg.leg_type === ShipmentLegType.PICKUP
    && leg.status === ShipmentLegStatusCode.ASSIGNED
    && PICKUP_WAITING_ORDER_STATUSES.includes(orderStatus)
  ) {
    return [
      { code: BlockchainEventType.PICKED_UP, label: "Đã lấy hàng" },
      { code: BlockchainEventType.PICKUP_FAILED, label: "Lấy hàng thất bại" },
    ];
  }
  if (leg.leg_type !== ShipmentLegType.LAST_MILE || leg.status !== ShipmentLegStatusCode.IN_PROGRESS) return [];
  if (leg.is_return) {
    return orderStatus === OrderStatusCode.RETURNING
      ? [
          { code: BlockchainEventType.DELIVERED, label: "Đã hoàn cho người gửi" },
          { code: BlockchainEventType.DELIVERY_FAILED, label: "Giao hoàn thất bại" },
        ]
      : [];
  }
  if (LAST_MILE_READY_ORDER_STATUSES.includes(orderStatus)) {
    return [{ code: BlockchainEventType.DELIVERING, label: "Bắt đầu giao" }];
  }
  return orderStatus === OrderStatusCode.DELIVERING
    ? [
        { code: BlockchainEventType.DELIVERED, label: "Giao thành công" },
        { code: BlockchainEventType.DELIVERY_FAILED, label: "Giao thất bại" },
      ]
    : [];
}

export function AdminOrderOperations({ orderId, onChanged }: AdminOrderOperationsProps): React.JSX.Element {
  const [route, setRoute] = useState<RouteItem | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Record<string, string>>({});
  const [selectedAction, setSelectedAction] = useState<Record<string, string>>({});
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [codCollected, setCodCollected] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [routes, staffRows] = await Promise.all([
        apiFetch<RouteItem[]>(`/api/shipment-routes?order_id=${encodeURIComponent(orderId)}&status=planned`),
        apiFetch<StaffOption[]>("/api/delivery-staff"),
      ]);
      setRoute(routes[0] ?? null);
      setStaff(staffRows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được dữ liệu điều phối");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderStatus = route?.order.order_statuses?.code ?? "";
  const activeLegs = useMemo(
    () => (route?.legs ?? []).filter((leg) => leg.leg_type !== ShipmentLegType.TRANSFER),
    [route],
  );

  async function assign(leg: RouteLeg): Promise<void> {
    const staffId = selectedStaff[leg.id];
    if (!staffId) {
      setError("Hãy chọn nhân viên giao hàng trước khi phân công.");
      return;
    }
    setSaving(leg.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/deliveries`, {
        method: "POST",
        body: JSON.stringify({
          order_id: orderId,
          shipment_leg_id: leg.id,
          delivery_staff_id: staffId,
        }),
      });
      setNotice(`Đã phân công chặng ${leg.sequence_no}.`);
      await load();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể phân công nhân viên");
    } finally {
      setSaving(null);
    }
  }

  async function recordStatus(leg: RouteLeg): Promise<void> {
    if (!leg.delivery_id) return;
    const action = selectedAction[leg.id] as BlockchainEventType | undefined;
    if (!action) {
      setError("Hãy chọn trạng thái cần cập nhật.");
      return;
    }
    if (action === BlockchainEventType.PICKUP_FAILED && !note.trim()) {
      setError("Báo lấy hàng thất bại phải kèm lý do.");
      return;
    }
    if (action === BlockchainEventType.DELIVERED && !proofUrl) {
      setError("Giao thành công cần đường dẫn ảnh bằng chứng.");
      return;
    }
    setSaving(leg.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/deliveries/${leg.delivery_id}/events`, {
        method: "POST",
        body: JSON.stringify({
          status_code: action,
          note: note.trim() || undefined,
          image_url: proofUrl ?? undefined,
          cod_collected: action === BlockchainEventType.DELIVERED && codCollected ? true : undefined,
        }),
      });
      setNotice(`Đã cập nhật trạng thái chặng ${leg.sequence_no}.`);
      setSelectedAction((current) => ({ ...current, [leg.id]: "" }));
      setProofUrl(null);
      setCodCollected(false);
      setNote("");
      await load();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể cập nhật trạng thái");
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <Card><p className="text-[12px] text-dt-muted">Đang tải điều phối đơn hàng...</p></Card>;
  if (!route) {
    return <Card><CardLabel>Điều phối đơn hàng</CardLabel><p className="mt-2 text-[12px] text-dt-muted">Đơn hàng chưa có tuyến vận chuyển để phân công.</p>{error ? <p className="mt-2 text-[12px] text-dt-red">{error}</p> : null}</Card>;
  }

  return (
    <Card>
      <CardLabel>Điều phối và cập nhật trạng thái</CardLabel>
      <p className="mt-1 text-[11px] text-dt-muted">Thao tác được kiểm tra lại ở backend theo chặng, vai trò và quy tắc chuyển trạng thái.</p>
      {error ? <p className="mt-3 rounded-md border border-dt-red/40 bg-dt-red/10 px-3 py-2 text-[12px] text-red-200">{error}</p> : null}
      {notice ? <p className="mt-3 rounded-md border border-dt-green/30 bg-dt-green/10 px-3 py-2 text-[12px] text-green-200">{notice}</p> : null}
      <div className="mt-4 space-y-4">
        {activeLegs.map((leg) => {
          const actions = statusActions(leg, orderStatus);
          const staffForLeg = staff.filter((member) => member.warehouse_id === (leg.leg_type === ShipmentLegType.PICKUP ? leg.to_warehouse_id : leg.from_warehouse_id));
          const canAssign = leg.status !== ShipmentLegStatusCode.IN_PROGRESS
            && leg.status !== ShipmentLegStatusCode.COMPLETED
            && leg.status !== ShipmentLegStatusCode.CANCELLED;
          return (
            <div key={leg.id} className="rounded-md border border-dt-border bg-dt-panel2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <p className="font-semibold">Chặng {leg.sequence_no} · {legTypeLabel(leg.leg_type)}{leg.is_return ? " · Tuyến hoàn" : ""}</p>
                <span className="text-dt-muted">{legStatusLabel(leg.status)} · Cập nhật {formatDateTime(leg.updated_at)}</span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <SelectField label="Nhân viên giao hàng" value={selectedStaff[leg.id] ?? leg.assigned_staff_id ?? ""} onChange={(event) => setSelectedStaff((current) => ({ ...current, [leg.id]: event.target.value }))} disabled={saving === leg.id || !canAssign}>
                  <option value="">Chưa phân công</option>
                  {staffForLeg.map((member) => <option key={member.id} value={member.id}>{member.full_name}{member.phone ? ` · ${member.phone}` : ""}</option>)}
                </SelectField>
                <Button onClick={() => void assign(leg)} disabled={saving === leg.id || !canAssign || staffForLeg.length === 0}>{saving === leg.id ? "Đang lưu..." : "Phân công"}</Button>
              </div>
              {actions.length > 0 ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <SelectField label="Cập nhật trạng thái" value={selectedAction[leg.id] ?? ""} onChange={(event) => setSelectedAction((current) => ({ ...current, [leg.id]: event.target.value }))} disabled={saving === leg.id}>
                    <option value="">Chọn trạng thái</option>
                    {actions.map((action) => <option key={action.code} value={action.code}>{action.label}</option>)}
                  </SelectField>
                  {selectedAction[leg.id] === BlockchainEventType.DELIVERED ? <ProofPhotoInput label="Ảnh bằng chứng" required value={proofUrl} onChange={setProofUrl} onUploadingChange={setProofUploading} /> : null}
                  <TextField label="Ghi chú" required={selectedAction[leg.id] === BlockchainEventType.PICKUP_FAILED} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} disabled={saving === leg.id} />
                  {selectedAction[leg.id] === BlockchainEventType.DELIVERED ? <label className="flex items-center gap-2 text-[12px] text-dt-muted"><input type="checkbox" checked={codCollected} onChange={(event) => setCodCollected(event.target.checked)} /> Đã thu đủ COD (nếu đơn có COD)</label> : null}
                  <div className="flex items-end"><Button onClick={() => void recordStatus(leg)} disabled={saving === leg.id || proofUploading}>{saving === leg.id ? "Đang lưu..." : "Cập nhật trạng thái"}</Button></div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
