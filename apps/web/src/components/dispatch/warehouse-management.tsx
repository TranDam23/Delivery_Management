"use client";

import {
  ArrowRight,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  MapPin,
  Plus,
  RefreshCw,
  Route,
  Search,
  ScanLine,
  Truck,
  Warehouse as WarehouseIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OrderStatusCode, PackageCondition, RoleCode, ShipmentLegStatusCode, ShipmentLegType, VIETNAM_PROVINCES, WarehouseEventType, WarehouseLevelCode, WarehouseStatusCode, type AuthenticatedUser, type ShipmentLegStatusCode as ShipmentLegStatus, type ShipmentLegType as ShipmentType, type Warehouse } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { AddressLocationFields } from "@/components/locations/address-location-fields";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime, STATUS_LABEL, statusClass as orderStatusClass } from "@/lib/order-ui";
import { legStatusLabel, legTypeLabel } from "@/lib/shipment-routing";

interface PlanningAddress {
  address_line: string;
  ward: string | null;
  district: string | null;
  province: string | null;
}

interface PlanningOrder {
  id: string;
  tracking_code: string;
  created_at: string;
  order_statuses: { code: string; name: string } | null;
  pickup_warehouse: WarehouseSummary | null;
  delivery_warehouse: WarehouseSummary | null;
  pickup_address: PlanningAddress | null;
  delivery_address: PlanningAddress | null;
  order_items?: Array<{ id: string; item_name: string; quantity: number; weight: number | null }>;
}

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
  leg_type: ShipmentType;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  assigned_staff_id: string | null;
  status: ShipmentLegStatus;
  attempt_no: number;
  is_return: boolean;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  from_warehouse: WarehouseSummary | null;
  to_warehouse: WarehouseSummary | null;
  assigned_staff: StaffOption | null;
}

interface WarehouseSummary {
  id: string;
  code: string;
  name: string;
  ward: string | null;
  province: string;
  district: string | null;
  status: string;
  warehouse_level: string;
  parent_warehouse_id: string | null;
  region_code: string | null;
}

interface RouteItem {
  order: PlanningOrder;
  legs: RouteLeg[];
}

interface ProfileResponse {
  user: AuthenticatedUser;
}

interface WarehouseForm {
  code: string;
  name: string;
  address_line: string;
  ward: string;
  district: string;
  province: string;
  capacity: string;
  regionCode: string;
  warehouseLevel: WarehouseLevelCode;
}

const EMPTY_WAREHOUSE: WarehouseForm = {
  code: "",
  name: "",
  address_line: "",
  ward: "",
  district: "",
  province: "",
  capacity: "",
  regionCode: "",
  warehouseLevel: WarehouseLevelCode.COMMUNE,
};

const WAREHOUSES_PER_PAGE = 10;
const ROUTES_PER_PAGE = 10;
const ORDER_STATUS_FILTERS = [
  "ALL",
  OrderStatusCode.CREATED,
  OrderStatusCode.PENDING_ASSIGNMENT,
  OrderStatusCode.ASSIGNED,
  OrderStatusCode.PICKED_UP,
  OrderStatusCode.IN_WAREHOUSE,
  OrderStatusCode.IN_TRANSIT,
  OrderStatusCode.DELIVERING,
  OrderStatusCode.DELIVERY_FAILED,
  OrderStatusCode.REDELIVERY,
  OrderStatusCode.RETURNING,
  OrderStatusCode.DELIVERED,
  OrderStatusCode.RETURNED,
  OrderStatusCode.CANCELLED,
].map((value) => ({ value, label: value === "ALL" ? "Tất cả" : STATUS_LABEL[value] ?? value }));

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function addressLabel(address: PlanningAddress | null): string {
  if (!address) return "Chưa có địa chỉ";
  return [address.address_line, address.ward, address.district, address.province].filter(Boolean).join(", ");
}

function hasRoutingAddress(address: PlanningAddress | null): boolean {
  return Boolean(address?.ward?.trim() && address.province?.trim());
}

function warehouseLabel(warehouse: WarehouseSummary | Warehouse | null): string {
  if (!warehouse) return "Chưa xác định kho";
  const level = warehouse.warehouse_level === WarehouseLevelCode.REGIONAL
    ? "Trung tâm vùng"
    : warehouse.warehouse_level === WarehouseLevelCode.PROVINCE
      ? "Kho cha cấp tỉnh"
      : "Điểm thu gom/phát";
  return `${warehouse.code} · ${warehouse.name} · ${level}${warehouse.province ? ` · ${warehouse.province}` : ""}`;
}

function statusClass(status: string): string {
  if (status === ShipmentLegStatusCode.COMPLETED) return "bg-dt-green/10 text-dt-green";
  if (status === ShipmentLegStatusCode.FAILED || status === ShipmentLegStatusCode.CANCELLED) return "bg-dt-red/10 text-red-300";
  if (status === ShipmentLegStatusCode.IN_PROGRESS) return "bg-sky-400/10 text-sky-300";
  return "bg-dt-yellow/10 text-dt-yellow";
}

function canAssignShipper(leg: RouteLeg): boolean {
  return leg.leg_type === ShipmentLegType.PICKUP || leg.leg_type === ShipmentLegType.LAST_MILE;
}

function operationalWarehouseId(leg: RouteLeg): string | null {
  return leg.leg_type === ShipmentLegType.PICKUP ? leg.to_warehouse_id : leg.from_warehouse_id;
}

interface RouteDetailsModalProps {
  routeItem: RouteItem;
  staff: StaffOption[];
  currentUser: AuthenticatedUser | null;
  saving: boolean;
  onClose: () => void;
  onAssign: (legId: string, staffId: string) => void;
  renderLegAction: (leg: RouteLeg) => React.JSX.Element | null;
}

function RouteDetailsModal({ routeItem, staff, currentUser, saving, onClose, onAssign, renderLegAction }: RouteDetailsModalProps): React.JSX.Element {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  const order = routeItem.order;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="route-details-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-dt border border-dt-border bg-dt-panel shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-dt-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-dt-yellow">Chi tiết tuyến đơn hàng</p>
            <h2 id="route-details-title" className="mt-1 truncate text-lg font-semibold">{order.tracking_code}</h2>
          </div>
          <Button type="button" variant="secondary" className="h-9 w-9 shrink-0 px-0" aria-label="Đóng chi tiết đơn hàng" onClick={onClose}><X size={16} /></Button>
        </header>
        <div className="overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-dt-border bg-dt-panel2 p-3">
              <p className="text-[10px] uppercase tracking-wide text-dt-muted">Người gửi · lấy hàng</p>
              <p className="mt-1 text-xs leading-5">{addressLabel(order.pickup_address)}</p>
            </div>
            <div className="rounded-md border border-dt-border bg-dt-panel2 p-3">
              <p className="text-[10px] uppercase tracking-wide text-dt-muted">Người nhận · giao hàng</p>
              <p className="mt-1 text-xs leading-5">{addressLabel(order.delivery_address)}</p>
            </div>
          </div>
          <div className="mt-4 rounded-md border border-dt-border bg-dt-panel2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-dt-muted">Hàng hóa</p>
              <p className="text-[10px] text-dt-muted">{order.order_items?.length ?? 0} mặt hàng</p>
            </div>
            {!order.order_items?.length ? <p className="mt-2 text-xs text-dt-muted">Chưa có thông tin hàng hóa.</p> : (
              <ul className="mt-2 divide-y divide-dt-border/70">
                {order.order_items.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs"><span>{item.item_name}</span><span className="text-dt-muted">SL {item.quantity}{item.weight ? ` · ${item.weight} kg` : ""}</span></li>)}
              </ul>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
            <div><p className="text-[10px] font-semibold uppercase tracking-wide text-dt-muted">Các chặng vận chuyển</p><p className="mt-1 text-xs text-dt-muted">Phân công shipper và theo dõi trạng thái từng chặng tại đây.</p></div>
            <span className="rounded-full bg-dt-yellow/10 px-2.5 py-1 text-[10px] text-dt-yellow">{routeItem.legs.length} chặng</span>
          </div>
          <div className="mt-3 space-y-3">
            {routeItem.legs.map((leg) => {
              const staffWarehouseId = operationalWarehouseId(leg);
              const legStaff = staffWarehouseId ? staff.filter((member) => member.warehouse_id === staffWarehouseId) : [];
              return <section key={leg.id} className="rounded-md border border-dt-border bg-dt-panel2 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-semibold">Chặng {leg.sequence_no}: {legTypeLabel(leg.leg_type, leg.is_return)}</h3>
                  <span className={`rounded-full px-2 py-1 text-[10px] ${statusClass(leg.status)}`}>{legStatusLabel(leg.status)}</span>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-dt-muted">{leg.from_warehouse ? warehouseLabel(leg.from_warehouse) : "Người gửi"}<ArrowRight size={12} />{leg.to_warehouse ? warehouseLabel(leg.to_warehouse) : leg.is_return ? "Người gửi (hoàn hàng)" : "Người nhận"}</p>
                {leg.updated_at && <p className="mt-1 text-[10px] text-dt-muted">Cập nhật {formatDateTime(leg.updated_at)}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canAssignShipper(leg) ? <select aria-label={`Phân công chặng ${leg.sequence_no}`} value={leg.assigned_staff_id ?? ""} onChange={(event) => onAssign(leg.id, event.target.value)} disabled={saving || leg.status === ShipmentLegStatusCode.COMPLETED || leg.status === ShipmentLegStatusCode.CANCELLED || (leg.leg_type === ShipmentLegType.LAST_MILE && leg.status === ShipmentLegStatusCode.PENDING)} className="h-9 min-w-[210px] rounded-dt border border-dt-border bg-dt-panel px-2 text-[11px] text-dt-text"><option value="">Chọn nhân viên</option>{legStaff.map((member) => <option key={member.id} value={member.id}>{member.full_name}{member.phone ? ` · ${member.phone}` : ""}{member.warehouse ? ` · ${member.warehouse.code}` : ""}</option>)}</select> : <span className="text-[10px] text-dt-muted">Nhân viên kho xử lý chặng trung chuyển</span>}
                  {canAssignShipper(leg) && leg.status === ShipmentLegStatusCode.PENDING && leg.leg_type === ShipmentLegType.LAST_MILE && <span className="text-[10px] text-dt-muted">Chờ hàng nhập kho đích</span>}
                  {leg.status === ShipmentLegStatusCode.FAILED && <span className="text-[10px] text-red-300">Chặng thất bại lần {leg.attempt_no} · cần xử lý hoặc phân công lại</span>}
                  {currentUser?.roleCode === RoleCode.ADMIN && renderLegAction(leg)}
                </div>
              </section>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WarehouseManagementPage(): React.JSX.Element {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [unplannedOrders, setUnplannedOrders] = useState<RouteItem[]>([]);
  const [plannedRoutes, setPlannedRoutes] = useState<RouteItem[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [warehouseForm, setWarehouseForm] = useState<WarehouseForm>(EMPTY_WAREHOUSE);
  const [provinceSearch, setProvinceSearch] = useState("");
  const [wardSearch, setWardSearch] = useState("");
  const [appliedProvinceSearch, setAppliedProvinceSearch] = useState("");
  const [appliedWardSearch, setAppliedWardSearch] = useState("");
  const [warehousePage, setWarehousePage] = useState(1);
  const [routePage, setRoutePage] = useState(1);
  const [routeStatusFilter, setRouteStatusFilter] = useState<string>("ALL");
  const [isAddWarehouseOpen, setIsAddWarehouseOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [openRouteOrderId, setOpenRouteOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [warehouseRows, unplanned, planned, staffRows, profileResult] = await Promise.all([
        apiFetch<Warehouse[]>("/api/warehouses"),
        apiFetch<RouteItem[]>("/api/shipment-routes?status=unplanned"),
        apiFetch<RouteItem[]>("/api/shipment-routes?status=planned"),
        apiFetch<StaffOption[]>("/api/delivery-staff"),
        apiFetch<ProfileResponse>("/api/auth/me"),
      ]);
      setWarehouses(warehouseRows);
      setUnplannedOrders(unplanned);
      setPlannedRoutes(planned);
      setStaff(staffRows);
      setCurrentUser(profileResult.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được dữ liệu kho và tuyến");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredWarehouses = useMemo(() => {
    const province = normalizeSearchText(appliedProvinceSearch);
    const ward = normalizeSearchText(appliedWardSearch);

    return warehouses.filter((warehouse) => {
      const matchesProvince = !province || normalizeSearchText(warehouse.province).includes(province);
      const matchesWard = !ward || normalizeSearchText(`${warehouse.ward ?? ""} ${warehouse.name}`).includes(ward);
      return matchesProvince && matchesWard;
    });
  }, [warehouses, appliedProvinceSearch, appliedWardSearch]);
  const warehousePageCount = Math.max(1, Math.ceil(filteredWarehouses.length / WAREHOUSES_PER_PAGE));
  const visibleWarehouses = filteredWarehouses.slice(
    (warehousePage - 1) * WAREHOUSES_PER_PAGE,
    warehousePage * WAREHOUSES_PER_PAGE,
  );
  const filteredRoutes = useMemo(
    () => routeStatusFilter === "ALL"
      ? plannedRoutes
      : plannedRoutes.filter((item) => item.order.order_statuses?.code === routeStatusFilter),
    [plannedRoutes, routeStatusFilter],
  );
  const routeStatusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    plannedRoutes.forEach((item) => {
      const code = item.order.order_statuses?.code;
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
    });
    return counts;
  }, [plannedRoutes]);
  const routePageCount = Math.max(1, Math.ceil(filteredRoutes.length / ROUTES_PER_PAGE));
  const visibleRoutes = filteredRoutes.slice((routePage - 1) * ROUTES_PER_PAGE, routePage * ROUTES_PER_PAGE);
  const openRoute = plannedRoutes.find((item) => item.order.id === openRouteOrderId) ?? null;
  const selectedOrder = unplannedOrders.find((item) => item.order.id === selectedOrderId)?.order ?? null;
  const selectedOrderRoutingReady = Boolean(
    selectedOrder && hasRoutingAddress(selectedOrder.pickup_address) && hasRoutingAddress(selectedOrder.delivery_address),
  );

  useEffect(() => {
    if (warehousePage > warehousePageCount) setWarehousePage(warehousePageCount);
  }, [warehousePage, warehousePageCount]);

  useEffect(() => {
    if (routePage > routePageCount) setRoutePage(routePageCount);
  }, [routePage, routePageCount]);

  useEffect(() => {
    if (!isAddWarehouseOpen) return;

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape" && !saving) setIsAddWarehouseOpen(false);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isAddWarehouseOpen, saving]);

  function setWarehouseField(field: keyof WarehouseForm, value: string): void {
    setWarehouseForm((current) => ({ ...current, [field]: value }));
  }

  async function createWarehouse(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch<Warehouse>("/api/warehouses", {
        method: "POST",
        body: JSON.stringify({
          code: warehouseForm.code,
          name: warehouseForm.name,
          address_line: warehouseForm.address_line,
          ward: warehouseForm.warehouseLevel === WarehouseLevelCode.COMMUNE ? warehouseForm.ward : null,
          district: warehouseForm.warehouseLevel === WarehouseLevelCode.COMMUNE ? warehouseForm.district : null,
          province: warehouseForm.province,
          capacity: warehouseForm.capacity ? Number(warehouseForm.capacity) : null,
          warehouse_level: warehouseForm.warehouseLevel,
          region_code: warehouseForm.warehouseLevel === WarehouseLevelCode.REGIONAL ? warehouseForm.regionCode : null,
        }),
      });
      setWarehouseForm(EMPTY_WAREHOUSE);
      setIsAddWarehouseOpen(false);
      setWarehousePage(1);
      setNotice("Đã tạo kho mới.");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tạo kho");
    } finally {
      setSaving(false);
    }
  }

  async function toggleWarehouse(warehouse: Warehouse): Promise<void> {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch<Warehouse>(`/api/warehouses/${warehouse.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: warehouse.status === WarehouseStatusCode.ACTIVE ? WarehouseStatusCode.INACTIVE : WarehouseStatusCode.ACTIVE,
        }),
      });
      setNotice(`Đã ${warehouse.status === WarehouseStatusCode.ACTIVE ? "vô hiệu hóa" : "kích hoạt lại"} kho ${warehouse.code}.`);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể cập nhật kho");
    } finally {
      setSaving(false);
    }
  }

  async function createRoute(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedOrderId) {
      setError("Hãy chọn đơn hàng cần lập bổ sung tuyến.");
      return;
    }
    if (!selectedOrder || !selectedOrderRoutingReady) {
      setError("Đơn hàng đang thiếu xã/phường hoặc tỉnh/thành phố. Hãy cập nhật địa chỉ trong Sổ địa chỉ rồi thử lại.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/shipment-routes", {
        method: "POST",
        body: JSON.stringify({
          order_id: selectedOrderId,
        }),
      });
      setSelectedOrderId("");
      setNotice("Đã lập bổ sung tuyến tối ưu cho đơn hàng cũ.");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tạo tuyến");
    } finally {
      setSaving(false);
    }
  }

  async function createAllRoutes(): Promise<void> {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{
        total: number;
        planned: number;
        failed: number;
        failures: Array<{ tracking_code: string; error: string }>;
      }>("/api/shipment-routes", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      });
      setNotice(`Đã lập tuyến tự động cho ${result.planned}/${result.total} đơn chưa có tuyến.`);
      if (result.failed > 0) {
        setError(`${result.failed} đơn chưa lập được tuyến. Kiểm tra thông tin địa chỉ hoặc dữ liệu kho trong danh sách lỗi.`);
      }
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể lập tuyến cho các đơn hàng");
    } finally {
      setSaving(false);
    }
  }

  async function assignLeg(legId: string, assignedStaffId: string): Promise<void> {
    if (!assignedStaffId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/shipment-routes/legs/${legId}`, {
        method: "PATCH",
        body: JSON.stringify({ assigned_staff_id: assignedStaffId }),
      });
      setNotice("Đã phân công nhân viên cho chặng.");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể phân công chặng");
    } finally {
      setSaving(false);
    }
  }

  async function recordWarehouseEvent(leg: RouteLeg, warehouseId: string, eventType: typeof WarehouseEventType[keyof typeof WarehouseEventType]): Promise<void> {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/shipment-routes/legs/${leg.id}/events`, {
        method: "POST",
        body: JSON.stringify({
          warehouse_id: warehouseId,
          event_type: eventType,
          // Admin ghi nhận thay kho: mặc định kiện nguyên vẹn, kho sẽ ghi chi tiết khi kiểm thực tế.
          ...(eventType === WarehouseEventType.INBOUND ? { package_condition: PackageCondition.INTACT } : {}),
        }),
      });
      setNotice(`Đã ghi nhận ${eventType === WarehouseEventType.INBOUND ? "nhập kho" : "xuất kho"} cho chặng ${leg.sequence_no}.`);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể ghi nhận sự kiện kho");
    } finally {
      setSaving(false);
    }
  }

  function renderLegAction(leg: RouteLeg): React.JSX.Element | null {
    if (leg.status === ShipmentLegStatusCode.COMPLETED || leg.status === ShipmentLegStatusCode.CANCELLED) return null;
    if (leg.leg_type === ShipmentLegType.PICKUP && leg.status === ShipmentLegStatusCode.IN_PROGRESS && leg.to_warehouse) {
      return <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={saving} onClick={() => void recordWarehouseEvent(leg, leg.to_warehouse!.id, WarehouseEventType.INBOUND)}><ScanLine size={13} /> Nhập kho</Button>;
    }
    if (leg.leg_type === ShipmentLegType.LAST_MILE && leg.status === ShipmentLegStatusCode.ASSIGNED && leg.assigned_staff_id && leg.from_warehouse) {
      return <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={saving} onClick={() => void recordWarehouseEvent(leg, leg.from_warehouse!.id, WarehouseEventType.OUTBOUND)}><ScanLine size={13} /> Xuất kho</Button>;
    }
    if (leg.leg_type === ShipmentLegType.TRANSFER) {
      if (leg.status === ShipmentLegStatusCode.IN_PROGRESS && leg.to_warehouse) {
        return <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={saving} onClick={() => void recordWarehouseEvent(leg, leg.to_warehouse!.id, WarehouseEventType.INBOUND)}><ScanLine size={13} /> Nhập kho</Button>;
      }
      if ((leg.status === ShipmentLegStatusCode.PENDING || leg.status === ShipmentLegStatusCode.ASSIGNED) && leg.from_warehouse) {
        return <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={saving} onClick={() => void recordWarehouseEvent(leg, leg.from_warehouse!.id, WarehouseEventType.OUTBOUND)}><ScanLine size={13} /> Xuất kho</Button>;
      }
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-dt-bg text-dt-text">
      <main className="mx-auto flex w-full max-w-[1440px] flex-col px-5 py-6 md:px-8 md:py-8">
        <PageHeader
          heading="Kho và điều phối tuyến"
          subtitle="Quản lý kho theo khu vực, chia chặng vận chuyển và theo dõi luồng nhập/xuất kho của từng đơn hàng."
          action={(
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => void loadData()} disabled={loading}>
                <RefreshCw size={14} className={loading ? "animate-spin" : undefined} /> Làm mới
              </Button>
              {currentUser?.roleCode === RoleCode.ADMIN ? (
                <Button onClick={() => { setError(null); setIsAddWarehouseOpen(true); }}>
                  <Plus size={14} /> Thêm kho
                </Button>
              ) : null}
            </div>
          )}
        />

        {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
        {notice ? <p role="status" className="mt-4 rounded-dt border border-dt-green/30 bg-dt-green/10 px-4 py-3 text-[12px] text-dt-green">{notice}</p> : null}
        {currentUser?.roleCode === RoleCode.DISPATCHER ? (
          <p className={`mt-4 rounded-dt border px-4 py-3 text-[12px] ${currentUser.warehouse_id ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "border-dt-yellow/40 bg-dt-yellow/10 text-dt-yellow"}`}>
            {currentUser.warehouse_id ? (
              <>Kho phụ trách đã được Admin gán: <strong>{warehouses.find((warehouse) => warehouse.id === currentUser.warehouse_id)?.name ?? currentUser.warehouse_id}</strong>. Bạn chỉ lập tuyến đầu lấy hàng, phân công chặng lấy/giao cuối tại kho này và theo dõi các chặng liên quan.</>
            ) : (
              <>Tài khoản chưa được gán kho phụ trách nên chưa thể nhận đơn để phân kho. Hãy liên hệ Admin để được cấu hình.</>
            )}
          </p>
        ) : null}

        <div className="order-3 mt-6">
          <Card className="gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardLabel>Danh sách kho</CardLabel>
                <p className="mt-1 text-sm font-semibold">Trung tâm vùng, kho tỉnh và điểm thu gom/phát khu vực</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-dt-muted">
                <WarehouseIcon className="text-dt-yellow" size={20} />
                <span>{filteredWarehouses.length} kết quả</span>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                setAppliedProvinceSearch(provinceSearch);
                setAppliedWardSearch(wardSearch);
                setWarehousePage(1);
              }}
              className="grid gap-3 rounded-md border border-dt-border bg-dt-panel2 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
            >
              <TextField label="Tỉnh/Thành phố" placeholder="Ví dụ: Cần Thơ" value={provinceSearch} onChange={(event) => setProvinceSearch(event.target.value)} />
              <TextField label="Xã/Phường" placeholder="Ví dụ: Bình Thủy" value={wardSearch} onChange={(event) => setWardSearch(event.target.value)} />
              <div className="flex gap-2">
                <Button type="submit"><Search size={14} /> Tìm kiếm</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setProvinceSearch("");
                    setWardSearch("");
                    setAppliedProvinceSearch("");
                    setAppliedWardSearch("");
                    setWarehousePage(1);
                  }}
                >
                  Xóa lọc
                </Button>
              </div>
            </form>

            {loading ? <p className="text-[12px] text-dt-muted">Đang tải kho...</p> : filteredWarehouses.length === 0 ? <p className="rounded-md bg-dt-panel2 p-4 text-[12px] text-dt-muted">Không tìm thấy kho phù hợp với bộ lọc.</p> : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-[11px]">
                    <thead className="border-b border-dt-border text-[10px] uppercase tracking-wide text-dt-muted">
                      <tr><th className="py-2 font-medium">Mã kho</th><th className="py-2 font-medium">Cấp kho</th><th className="py-2 font-medium">Khu vực</th><th className="py-2 font-medium">Địa chỉ</th><th className="py-2 font-medium">Trạng thái</th>{currentUser?.roleCode === RoleCode.ADMIN ? <th className="py-2 text-right font-medium"> </th> : null}</tr>
                    </thead>
                    <tbody>
                      {visibleWarehouses.map((warehouse) => (
                        <tr key={warehouse.id} className="border-b border-dt-border/70 last:border-0">
                          <td className="py-3 font-semibold text-dt-yellow">{warehouse.code}<p className="mt-1 font-normal text-dt-text">{warehouse.name}</p></td>
                          <td className="py-3"><span className={`rounded-full px-2 py-1 text-[10px] ${warehouse.warehouse_level === WarehouseLevelCode.REGIONAL ? "bg-purple-400/10 text-purple-300" : warehouse.warehouse_level === WarehouseLevelCode.PROVINCE ? "bg-sky-400/10 text-sky-300" : "bg-dt-yellow/10 text-dt-yellow"}`}>{warehouse.warehouse_level === WarehouseLevelCode.REGIONAL ? "Trung tâm vùng" : warehouse.warehouse_level === WarehouseLevelCode.PROVINCE ? "Kho cha · tỉnh" : "Điểm thu gom/phát"}</span></td>
                          <td className="py-3 text-dt-muted">{[warehouse.district, warehouse.province].filter(Boolean).join(", ")}</td>
                          <td className="max-w-[230px] py-3 text-dt-muted">{[warehouse.address_line, warehouse.ward].filter(Boolean).join(", ")}</td>
                          <td className="py-3"><span className={`rounded-full px-2 py-1 text-[10px] ${warehouse.status === WarehouseStatusCode.ACTIVE ? "bg-dt-green/10 text-dt-green" : "bg-white/5 text-dt-muted"}`}>{warehouse.status === WarehouseStatusCode.ACTIVE ? "Đang hoạt động" : "Tạm dừng"}</span></td>
                          {currentUser?.roleCode === RoleCode.ADMIN ? <td className="py-3 text-right"><Button variant="secondary" className="px-2.5 py-1.5 text-[10px]" disabled={saving} onClick={() => void toggleWarehouse(warehouse)}>{warehouse.status === WarehouseStatusCode.ACTIVE ? "Tạm dừng" : "Kích hoạt"}</Button></td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dt-border pt-3 text-[11px] text-dt-muted">
                  <span>Hiển thị {(warehousePage - 1) * WAREHOUSES_PER_PAGE + 1}–{Math.min(warehousePage * WAREHOUSES_PER_PAGE, filteredWarehouses.length)} trong tổng số {filteredWarehouses.length} kho</span>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={warehousePage === 1} onClick={() => setWarehousePage((page) => Math.max(1, page - 1))}><ChevronLeft size={14} /> Trước</Button>
                    <span className="min-w-[76px] text-center">Trang {warehousePage}/{warehousePageCount}</span>
                    <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={warehousePage === warehousePageCount} onClick={() => setWarehousePage((page) => Math.min(warehousePageCount, page + 1))}>Sau <ChevronRight size={14} /></Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        <Card className="order-2 mt-5 gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><CardLabel>Theo dõi và điều chỉnh tuyến</CardLabel><p className="mt-1 text-sm font-semibold">Hệ thống tự động lập tuyến tối ưu theo mạng kho</p></div><div className="flex items-center gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={() => void createAllRoutes()}><Route size={14} /> Lập tuyến tất cả</Button><Route className="text-dt-yellow" size={20} /></div></div>
          <div className="rounded-md border border-sky-400/25 bg-sky-400/5 p-3 text-[11px] leading-5 text-sky-100">
            Đơn mới được tự động chọn kho con gần địa chỉ, đi qua kho cha và trung tâm vùng khi cần. Điều phối viên chỉ cần theo dõi tiến độ, phân công shipper và điều chỉnh các trường hợp ngoại lệ. Danh sách bên dưới chỉ dành cho đơn cũ chưa có tuyến hoặc đơn cần lập bổ sung.
          </div>
          <form onSubmit={(event) => void createRoute(event)} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <SelectField label="Đơn cũ chưa có tuyến" required value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)} hint={selectedOrder ? `Lấy hàng: ${addressLabel(selectedOrder.pickup_address)} · Giao hàng: ${addressLabel(selectedOrder.delivery_address)}${selectedOrderRoutingReady ? "" : " · Thiếu thông tin định tuyến: cần bổ sung xã/phường và tỉnh/thành phố."}` : "Nếu danh sách trống, các đơn mới đã được lập tuyến tự động."}>
              <option value="" className="bg-dt-panel2">Chọn đơn hàng</option>
              {unplannedOrders.map((item) => <option key={item.order.id} value={item.order.id} className="bg-dt-panel2">{item.order.tracking_code} · {item.order.pickup_warehouse?.name ?? "Chưa gán kho lấy"} · {item.order.pickup_address?.province ?? "Thiếu tỉnh"} → {item.order.delivery_address?.province ?? "Thiếu tỉnh"}</option>)}
            </SelectField>
            <Button type="submit" disabled={saving || !selectedOrderId || !selectedOrderRoutingReady} className="w-full lg:w-auto"><Route size={14} /> Lập tuyến bổ sung</Button>
          </form>
          {selectedOrder ? <div className="grid gap-3 rounded-md border border-sky-400/25 bg-sky-400/5 p-3 text-[11px] md:grid-cols-2"><div><p className="text-dt-muted">Kho lấy hàng được tự động gán</p><p className="mt-1 font-medium text-sky-200">{selectedOrder.pickup_warehouse ? warehouseLabel(selectedOrder.pickup_warehouse) : "Chưa xác định — cần kiểm tra lại dữ liệu kho"}</p><p className="mt-1 text-dt-muted">Điều phối viên tại kho này sẽ phân công shipper đến lấy hàng.</p></div><div><p className="text-dt-muted">Kho giao cuối được tự động gán</p><p className="mt-1 font-medium text-sky-200">{selectedOrder.delivery_warehouse ? warehouseLabel(selectedOrder.delivery_warehouse) : "Chưa xác định — cần kiểm tra lại dữ liệu kho"}</p><p className="mt-1 text-dt-muted">Sau khi tạo tuyến, đơn sẽ xuất hiện cho điều phối viên kho giao cuối.</p></div></div> : null}
          {selectedOrder && !selectedOrderRoutingReady ? <p role="alert" className="rounded-md border border-dt-yellow/40 bg-dt-yellow/10 px-3 py-2 text-[11px] leading-5 text-dt-yellow">Đơn này là dữ liệu cũ và chưa đủ địa chỉ định tuyến. Vào <a href="/contacts" className="font-semibold underline underline-offset-2">Sổ địa chỉ</a>, sửa địa chỉ người gửi và người nhận, bổ sung xã/phường và tỉnh/thành phố rồi tải lại trang.</p> : null}
          <div className="grid gap-3 rounded-md border border-dt-border bg-dt-panel2 p-3 text-[11px] text-dt-muted md:grid-cols-3"><span className="flex items-center gap-1.5"><MapPin size={13} className="text-dt-yellow" /> Người gửi → kho con lấy hàng</span><span className="flex items-center gap-1.5"><Boxes size={13} className="text-sky-300" /> Kho tỉnh → hub vùng khi khác vùng</span><span className="flex items-center gap-1.5"><Truck size={13} className="text-dt-green" /> Kho tỉnh → kho con → người nhận</span></div>
        </Card>

        <Card className="order-1 mt-5 gap-4">
          <div className="flex items-start justify-between gap-3"><div><CardLabel>Đơn hàng đã lập tuyến</CardLabel><p className="mt-1 text-sm font-semibold">Chọn một đơn để xem các chặng và phân công</p></div><Truck className="text-dt-yellow" size={20} /></div>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div role="group" aria-label="Lọc đơn hàng theo trạng thái" className="flex min-w-max gap-2">
              {ORDER_STATUS_FILTERS.map((status) => {
                const active = routeStatusFilter === status.value;
                const count = status.value === "ALL" ? plannedRoutes.length : routeStatusCounts.get(status.value) ?? 0;
                return <button
                  key={status.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setRouteStatusFilter(status.value); setRoutePage(1); }}
                  className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px] transition ${active ? "border-dt-yellow bg-dt-yellow text-dt-bg" : "border-dt-border bg-dt-panel2 text-dt-muted hover:text-dt-text"}`}
                >
                  <span>{status.label}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-black/10" : "bg-white/5"}`}>{count}</span>
                </button>;
              })}
            </div>
          </div>
          {filteredRoutes.length === 0 ? <p className="rounded-md bg-dt-panel2 p-4 text-[12px] text-dt-muted">{plannedRoutes.length === 0 ? "Chưa có đơn nào được phân tuyến." : "Không có đơn hàng ở trạng thái này."}</p> : <>
            <div className="overflow-x-auto rounded-md border border-dt-border">
              <table id="planned-orders-table" className="w-full min-w-[980px] text-left text-[11px]">
                <thead className="bg-dt-panel2 text-[10px] uppercase tracking-wide text-dt-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Mã đơn hàng</th>
                    <th className="px-4 py-3 font-medium">Tên hàng hóa</th>
                    <th className="px-4 py-3 font-medium">Địa chỉ nhận</th>
                    <th className="px-4 py-3 font-medium">Địa chỉ giao</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                    <th className="px-4 py-3 text-right font-medium">Tuyến</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dt-border">
                  {visibleRoutes.map((routeItem) => {
                    const order = routeItem.order;
                    const itemNames = order.order_items?.length
                      ? order.order_items.map((item) => `${item.item_name} ×${item.quantity}`).join(", ")
                      : "Chưa có thông tin hàng hóa";
                    const pickupAddress = addressLabel(order.pickup_address);
                    const deliveryAddress = addressLabel(order.delivery_address);
                    const openOrder = (): void => setOpenRouteOrderId(order.id);
                    return <tr key={order.id} role="button" tabIndex={0} aria-label={`Mở chi tiết đơn ${order.tracking_code}`} onClick={openOrder} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openOrder(); } }} className="cursor-pointer bg-dt-panel transition hover:bg-dt-panel2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-dt-yellow">
                      <td className="px-4 py-3 font-semibold text-dt-yellow">{order.tracking_code}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-dt-text" title={itemNames}>{itemNames}</td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-dt-muted" title={pickupAddress}>{pickupAddress}</td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-dt-muted" title={deliveryAddress}>{deliveryAddress}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] ${orderStatusClass(order.order_statuses)}`}>{STATUS_LABEL[order.order_statuses?.code ?? ""] ?? order.order_statuses?.name ?? "Chưa cập nhật"}</span></td>
                      <td className="px-4 py-3 text-right text-dt-muted"><span className="inline-flex items-center justify-end gap-1 text-dt-yellow">{routeItem.legs.length} chặng <ChevronRight size={14} /></span></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            {filteredRoutes.length > ROUTES_PER_PAGE ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dt-border pt-3 text-[11px] text-dt-muted">
              <span>Hiển thị {(routePage - 1) * ROUTES_PER_PAGE + 1}–{Math.min(routePage * ROUTES_PER_PAGE, filteredRoutes.length)} trong tổng số {filteredRoutes.length} đơn</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={routePage === 1} onClick={() => setRoutePage((value) => Math.max(1, value - 1))}><ChevronLeft size={14} /> Trước</Button>
                <span className="min-w-[76px] text-center">Trang {routePage}/{routePageCount}</span>
                <Button variant="secondary" className="px-3 py-2 text-[11px]" disabled={routePage === routePageCount} onClick={() => setRoutePage((value) => Math.min(routePageCount, value + 1))}>Sau <ChevronRight size={14} /></Button>
              </div>
            </div> : null}
          </>}
        </Card>
        <p className="order-4 mt-4 flex items-start gap-2 text-[11px] leading-5 text-dt-muted"><CheckCircle2 className="mt-0.5 shrink-0 text-dt-green" size={14} />{currentUser?.roleCode === RoleCode.ADMIN ? "Admin có thể ghi nhận mốc nhập/xuất kho để kiểm soát toàn hệ thống. Điều phối viên phân công shipper ở chặng lấy hàng/chặng cuối; nhân viên kho xử lý các chặng trung chuyển." : "Điều phối viên chỉ phân công shipper ở chặng lấy hàng hoặc giao cuối tại kho được gán. Các chặng trung chuyển do nhân viên kho xác nhận nhập/xuất."}</p>

        {openRoute ? <RouteDetailsModal routeItem={openRoute} staff={staff} currentUser={currentUser} saving={saving} onClose={() => setOpenRouteOrderId(null)} onAssign={(legId, staffId) => void assignLeg(legId, staffId)} renderLegAction={renderLegAction} /> : null}

        {isAddWarehouseOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-warehouse-title"
            onMouseDown={() => { if (!saving) setIsAddWarehouseOpen(false); }}
          >
            <div
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-dt border border-dt-border bg-dt-panel p-5 shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-dt-border pb-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-dt-muted">Thêm kho</p>
                  <h2 id="add-warehouse-title" className="mt-1 text-lg font-semibold">Khai báo một điểm tập kết</h2>
                </div>
                <Button type="button" variant="secondary" className="h-9 w-9 px-0" aria-label="Đóng cửa sổ thêm kho" onClick={() => setIsAddWarehouseOpen(false)} disabled={saving}>
                  <X size={16} />
                </Button>
              </div>
              <form onSubmit={(event) => void createWarehouse(event)} className="mt-5 grid gap-3 sm:grid-cols-2">
                <TextField label="Mã kho" required placeholder="HN-CG-01" value={warehouseForm.code} onChange={(event) => setWarehouseField("code", event.target.value)} />
                <TextField label="Tên kho" required placeholder="Kho Cầu Giấy" value={warehouseForm.name} onChange={(event) => setWarehouseField("name", event.target.value)} />
                <SelectField
                  label="Cấp kho"
                  required
                  value={warehouseForm.warehouseLevel}
                  onChange={(event) => {
                    const level = event.target.value as WarehouseLevelCode;
                    setWarehouseForm((current) => ({
                      ...current,
                      warehouseLevel: level,
                      ...(level !== WarehouseLevelCode.COMMUNE ? { ward: "", district: "" } : {}),
                      ...(level !== WarehouseLevelCode.REGIONAL ? { regionCode: "" } : {}),
                    }));
                  }}
                  hint={warehouseForm.warehouseLevel === WarehouseLevelCode.REGIONAL ? "Trung tâm vùng do quản trị viên khai báo, phục vụ nhiều tỉnh/thành phố." : warehouseForm.warehouseLevel === WarehouseLevelCode.PROVINCE ? "Kho tỉnh được gắn vào một trung tâm vùng." : "Điểm thu gom/phát sẽ tự động gắn vào kho tỉnh cùng tỉnh/thành phố."}
                >
                  <option value={WarehouseLevelCode.COMMUNE} className="bg-dt-panel2">Điểm thu gom/phát · xã/phường</option>
                  <option value={WarehouseLevelCode.PROVINCE} className="bg-dt-panel2">Kho cha · tỉnh/thành phố</option>
                  {currentUser?.roleCode === RoleCode.ADMIN ? <option value={WarehouseLevelCode.REGIONAL} className="bg-dt-panel2">Trung tâm vùng</option> : null}
                </SelectField>
                {warehouseForm.warehouseLevel === WarehouseLevelCode.REGIONAL ? <TextField label="Mã vùng" required placeholder="NORTH" value={warehouseForm.regionCode} onChange={(event) => setWarehouseField("regionCode", event.target.value)} /> : null}
                <TextField label="Địa chỉ" required wrapperClassName="sm:col-span-2" placeholder="Số nhà, tên đường" value={warehouseForm.address_line} onChange={(event) => setWarehouseField("address_line", event.target.value)} />
                {warehouseForm.warehouseLevel === WarehouseLevelCode.COMMUNE ? (
                  <AddressLocationFields
                    value={{ province: warehouseForm.province, district: warehouseForm.district, ward: warehouseForm.ward }}
                    onChange={(location) => setWarehouseForm((current) => ({ ...current, ...location }))}
                    wrapperClassName="grid gap-3 sm:col-span-2 sm:grid-cols-3"
                  />
                ) : (
                  <SelectField label="Tỉnh/Thành phố" required value={warehouseForm.province} onChange={(event) => setWarehouseField("province", event.target.value)}>
                    <option value="" className="bg-dt-panel2">Chọn tỉnh/thành phố</option>
                    {VIETNAM_PROVINCES.map((province) => (
                      <option key={province} value={province} className="bg-dt-panel2">{province}</option>
                    ))}
                  </SelectField>
                )}
                <TextField label="Sức chứa (kiện)" type="number" min="0" value={warehouseForm.capacity} onChange={(event) => setWarehouseField("capacity", event.target.value)} />
                <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
                  <Button type="button" variant="secondary" onClick={() => setIsAddWarehouseOpen(false)} disabled={saving}>Hủy</Button>
                  <Button type="submit" disabled={saving}><Plus size={14} /> {saving ? "Đang lưu..." : "Thêm kho"}</Button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
