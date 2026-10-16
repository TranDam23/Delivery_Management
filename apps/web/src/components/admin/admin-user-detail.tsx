"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleCode, WarehouseLevelCode, WarehouseStatusCode, UserStatus } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { AdminRoleChangeDialog } from "@/components/admin/admin-role-change-dialog";
import { AdminWarehouseUnassignDialog } from "@/components/admin/admin-warehouse-unassign-dialog";
import { WarehouseAssignmentPicker } from "@/components/admin/warehouse-assignment-picker";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/order-ui";

interface Warehouse {
  id: string;
  code: string;
  name: string;
  province: string;
  warehouse_level: string;
  status: string;
}

interface AdminUserDetail {
  id: string;
  role: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  province: string | null;
  warehouseId: string | null;
  warehouse: Warehouse | null;
}

interface AdminUserDetailResponse {
  user: AdminUserDetail;
}

const ROLE_OPTIONS = [
  { code: RoleCode.CUSTOMER, label: "Khách hàng" },
  { code: RoleCode.DELIVERY_STAFF, label: "Nhân viên giao nhận" },
  { code: RoleCode.DISPATCHER, label: "Điều phối viên" },
  { code: RoleCode.WAREHOUSE_STAFF, label: "Nhân viên kho" },
  { code: RoleCode.ADMIN, label: "Quản trị viên" },
];

const STATUS_OPTIONS = [
  { code: UserStatus.ACTIVE, label: "Hoạt động" },
  { code: UserStatus.INACTIVE, label: "Ngưng hoạt động" },
  { code: UserStatus.SUSPENDED, label: "Đã khóa" },
];

const OPERATIONAL_ROLE_CODES = [
  RoleCode.DISPATCHER,
  RoleCode.DELIVERY_STAFF,
  RoleCode.WAREHOUSE_STAFF,
] as const;
type OperationalRoleCode = (typeof OPERATIONAL_ROLE_CODES)[number];

function isOperationalRole(code: string): code is OperationalRoleCode {
  return OPERATIONAL_ROLE_CODES.some((candidate) => candidate === code);
}

function isWarehouseValidForRole(roleCode: string, warehouse: Warehouse | undefined): boolean {
  if (!warehouse || warehouse.status !== WarehouseStatusCode.ACTIVE) return false;
  if (roleCode === RoleCode.DISPATCHER) {
    return warehouse.warehouse_level === WarehouseLevelCode.COMMUNE
      || warehouse.warehouse_level === WarehouseLevelCode.PROVINCE;
  }
  if (roleCode === RoleCode.DELIVERY_STAFF) {
    return warehouse.warehouse_level === WarehouseLevelCode.COMMUNE;
  }
  return roleCode === RoleCode.WAREHOUSE_STAFF;
}

function roleLabel(code: string): string {
  return ROLE_OPTIONS.find((option) => option.code === code)?.label ?? code;
}

function warehouseLabel(warehouse: Warehouse): string {
  return `${warehouse.code} · ${warehouse.name} · ${warehouse.province}`;
}

export function AdminUserDetailPage({ userId }: { userId: string }): React.JSX.Element {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [protectionError, setProtectionError] = useState(false);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [unassignRequested, setUnassignRequested] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [detail, warehouseResult] = await Promise.all([
        apiFetch<AdminUserDetailResponse>(`/api/admin/users/${encodeURIComponent(userId)}`),
        apiFetch<Warehouse[]>("/api/warehouses"),
      ]);
      const nextUser = detail.user;
      setUser(nextUser);
      setWarehouses(warehouseResult);
      setFullName(nextUser.fullName);
      setPhone(nextUser.phone ?? "");
      setRole(nextUser.role);
      setStatus(nextUser.status);
      setWarehouseId(nextUser.warehouseId ?? "");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setError("Không tìm thấy tài khoản.");
      } else {
        setError(caught instanceof Error ? caught.message : "Không tải được thông tin tài khoản.");
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableWarehouses = useMemo(() => warehouses.filter((warehouse) => {
    return isWarehouseValidForRole(role, warehouse);
  }), [role, warehouses]);

  function handleRoleChange(nextRole: string): void {
    setRole(nextRole);
    if (!isOperationalRole(nextRole)) {
      setWarehouseId("");
      return;
    }

    if (warehouseId && !isWarehouseValidForRole(nextRole, warehouses.find((warehouse) => warehouse.id === warehouseId))) {
      setWarehouseId("");
      setError("Kho hiện tại không phù hợp với vai trò mới. Vui lòng chọn lại kho trước khi lưu.");
    }
  }

  async function updateUser(): Promise<void> {
    if (!user) return;
    const selectedWarehouse = warehouseId
      ? warehouses.find((warehouse) => warehouse.id === warehouseId)
      : undefined;
    if (isOperationalRole(role) && warehouseId && !isWarehouseValidForRole(role, selectedWarehouse)) {
      setError("Kho hiện tại không phù hợp với vai trò mới. Vui lòng chọn lại kho trước khi lưu.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    setProtectionError(false);
    try {
      const payload: Record<string, string | null> = {
        full_name: fullName,
        phone: phone || null,
        role_code: role,
        status,
      };
      if (isOperationalRole(role)) {
        payload.warehouse_id = warehouseId || null;
      }

      await apiFetch<AdminUserDetail>(
        `/api/admin/users/${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
      setNotice("Đã cập nhật tài khoản.");
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Không thể cập nhật tài khoản.";
      const isProtectedAdminAction = message.includes("Không thể tự hạ quyền hoặc khóa chính tài khoản đang đăng nhập");
      setProtectionError(isProtectedAdminAction);
      setError(isProtectedAdminAction ? null : message);
    } finally {
      setSaving(false);
    }
  }

  function save(event: React.FormEvent): void {
    event.preventDefault();
    if (!user) return;
    if (role !== user.role) {
      setPendingRole(role);
      return;
    }
    void updateUser();
  }

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-6 md:px-8 md:py-8">
      <PageHeader
        heading={user ? `Tài khoản ${user.fullName}` : "Chi tiết tài khoản"}
        subtitle="Xem và cập nhật thông tin, vai trò, trạng thái và phạm vi vận hành."
        action={<Link href="/dashboard/admin/users" className={buttonClassName("secondary")}><ArrowLeft size={14} /> Danh sách</Link>}
      />

      {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-dt border border-dt-green/30 bg-dt-green/10 px-4 py-3 text-[12px] text-dt-green">{notice}</p> : null}
      {protectionError ? (
        <div role="alert" className="mt-4 flex gap-3 rounded-dt border border-dt-red/50 bg-dt-red/10 px-4 py-3 text-[12px] text-red-100">
          <ShieldAlert className="mt-0.5 shrink-0 text-dt-red" size={18} aria-hidden="true" />
          <div>
            <p className="font-semibold text-red-100">Không thể thay đổi tài khoản Admin hiện tại</p>
            <p className="mt-1 leading-5">Bạn không thể tự khóa tài khoản hoặc tự hạ quyền Admin của chính mình. Vui lòng sử dụng một tài khoản Admin khác có đủ quyền để thực hiện thay đổi.</p>
          </div>
        </div>
      ) : null}
      {loading ? <Card className="mt-5"><p className="text-[12px] text-dt-muted">Đang tải thông tin tài khoản...</p></Card> : null}
      {!loading && user ? (
        <>
          <Card className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <CardLabel>Thông tin tài khoản</CardLabel>
              <Button variant="secondary" onClick={() => void load()} disabled={saving}><RefreshCw size={14} /> Làm mới</Button>
            </div>
            <form onSubmit={(event) => void save(event)} className="grid gap-4 md:grid-cols-2">
              <TextField label="Họ tên" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
              <TextField label="Email" value={user.email} disabled />
              <TextField label="Số điện thoại" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value)} />
              <SelectField label="Vai trò" value={role} onChange={(event) => {
                handleRoleChange(event.target.value);
              }}>
                {ROLE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </SelectField>
              <SelectField label="Trạng thái" value={status} onChange={(event) => setStatus(event.target.value)}>
                {STATUS_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </SelectField>
              {isOperationalRole(role) ? (
                <WarehouseAssignmentPicker
                  label="Kho phụ trách"
                  warehouses={availableWarehouses}
                  value={warehouseId}
                  onChange={setWarehouseId}
                  onRequestClear={() => {
                    if (warehouseId) setUnassignRequested(true);
                    else setWarehouseId("");
                  }}
                />
              ) : <div />}
              <div className="flex items-center gap-3 md:col-span-2">
                <Button type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</Button>
                <span className="text-[11px] text-dt-muted">Vai trò hiện tại: {roleLabel(user.role)}</span>
              </div>
            </form>
          </Card>

          <Card className="mt-5">
            <CardLabel>Thông tin hệ thống</CardLabel>
            <dl className="grid gap-3 text-[12px] md:grid-cols-2">
              <div><dt className="text-dt-muted">Ngày tạo</dt><dd className="mt-1">{formatDateTime(user.createdAt)}</dd></div>
              <div><dt className="text-dt-muted">Cập nhật gần nhất</dt><dd className="mt-1">{formatDateTime(user.updatedAt)}</dd></div>
              <div><dt className="text-dt-muted">Đăng nhập gần nhất</dt><dd className="mt-1">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Chưa đăng nhập"}</dd></div>
              <div><dt className="text-dt-muted">Phạm vi tỉnh</dt><dd className="mt-1">{user.province ?? "—"}</dd></div>
              <div><dt className="text-dt-muted">Kho phụ trách</dt><dd className="mt-1">{user.warehouse ? warehouseLabel(user.warehouse) : "Chưa gán kho"}</dd></div>
            </dl>
          </Card>
        </>
      ) : null}
      <AdminRoleChangeDialog
        open={pendingRole !== null}
        userName={user?.fullName ?? ""}
        roleName={pendingRole ? roleLabel(pendingRole) : ""}
        busy={saving}
        onCancel={() => {
          setPendingRole(null);
          if (user) {
            setRole(user.role);
            setWarehouseId(user.warehouseId ?? "");
          }
        }}
        onConfirm={() => {
          setPendingRole(null);
          void updateUser();
        }}
      />
      <AdminWarehouseUnassignDialog
        open={unassignRequested}
        userName={user?.fullName ?? ""}
        warehouseName={warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? user?.warehouse?.name ?? "kho hiện tại"}
        busy={saving}
        onCancel={() => setUnassignRequested(false)}
        onConfirm={() => {
          setUnassignRequested(false);
          setWarehouseId("");
        }}
      />
    </div>
  );
}
