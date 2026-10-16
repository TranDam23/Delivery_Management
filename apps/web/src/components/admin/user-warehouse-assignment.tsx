"use client";

import { CheckCircle2, RefreshCw, Settings2, Warehouse as WarehouseIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RoleCode, WarehouseLevelCode, type Warehouse } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { AdminRoleChangeDialog } from "@/components/admin/admin-role-change-dialog";
import { AdminWarehouseUnassignDialog } from "@/components/admin/admin-warehouse-unassign-dialog";
import { WarehouseAssignmentPicker } from "@/components/admin/warehouse-assignment-picker";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";

interface AssignedWarehouse extends Pick<Warehouse, "id" | "code" | "name" | "province" | "warehouse_level"> {
  ward: string | null;
  district: string | null;
}

interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  province: string | null;
  warehouse_id: string | null;
  status: string;
  roles: { code: string; name: string } | { code: string; name: string }[] | null;
  warehouses: AssignedWarehouse | AssignedWarehouse[] | null;
}

interface UsersResponse {
  users: AdminUser[];
  warehouses: AssignedWarehouse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const ROLE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: RoleCode.CUSTOMER, label: "Khách hàng" },
  { code: RoleCode.DELIVERY_STAFF, label: "Nhân viên giao nhận" },
  { code: RoleCode.DISPATCHER, label: "Điều phối viên" },
  { code: RoleCode.WAREHOUSE_STAFF, label: "Nhân viên kho" },
  { code: RoleCode.ADMIN, label: "Quản trị viên" },
];
const STATUS_LABEL: Record<string, string> = { active: "Hoạt động", inactive: "Ngưng hoạt động", suspended: "Đã khóa" };
const STATUS_OPTIONS = [
  { code: "", label: "Tất cả trạng thái" },
  { code: "active", label: "Hoạt động" },
  { code: "inactive", label: "Ngưng hoạt động" },
  { code: "suspended", label: "Đã khóa" },
];

const USER_LIST_GRID_COLUMNS = "grid-cols-[minmax(150px,1.35fr)_120px_135px_90px_minmax(150px,1fr)_300px]";
const OPERATIONAL_ROLES: ReadonlySet<string> = new Set([RoleCode.DISPATCHER, RoleCode.DELIVERY_STAFF, RoleCode.WAREHOUSE_STAFF]);
const USERS_PAGE_SIZE = 10;

function relationValue<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function roleCode(user: AdminUser): string | null {
  return relationValue(user.roles)?.code ?? null;
}

function roleLabel(code: string | null): string {
  if (code === RoleCode.DISPATCHER) return "Điều phối viên";
  if (code === RoleCode.DELIVERY_STAFF) return "Nhân viên giao nhận";
  if (code === RoleCode.WAREHOUSE_STAFF) return "Nhân viên kho";
  if (code === RoleCode.ADMIN) return "Quản trị viên";
  return "Khách hàng";
}

function warehouseLabel(warehouse: AssignedWarehouse | null): string {
  if (!warehouse) return "Chưa được gán kho";
  const level = warehouse.warehouse_level === WarehouseLevelCode.REGIONAL
    ? "trung tâm vùng"
    : warehouse.warehouse_level === WarehouseLevelCode.PROVINCE
      ? "kho cha"
      : "kho con";
  return `${warehouse.code} · ${warehouse.name} · ${level}`;
}

export function UserWarehouseAssignmentPage(): React.JSX.Element {
  const searchParams = useSearchParams();
  const requestedRole = searchParams.get("role") ?? "";
  const isDeliveryStaffPage = requestedRole === RoleCode.DELIVERY_STAFF;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [warehouses, setWarehouses] = useState<AssignedWarehouse[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(requestedRole);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<UsersResponse["pagination"]>({
    page: 1,
    limit: USERS_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [form, setForm] = useState({ full_name: "", email: "", password: "", phone: "", role_code: (requestedRole || RoleCode.DELIVERY_STAFF) as string, warehouse_id: "" });
  const [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<{ user: AdminUser; roleCode: string } | null>(null);
  const [pendingUnassign, setPendingUnassign] = useState<{ user: AdminUser; warehouseName: string } | null>(null);

  const loadData = useCallback(async (
    requestedPage: number,
    requestedSearch: string,
    requestedRole: string,
    requestedStatus: string,
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(requestedPage),
        limit: String(USERS_PAGE_SIZE),
      });
      if (requestedSearch) params.set("search", requestedSearch);
      if (requestedRole) params.set("role", requestedRole);
      if (requestedStatus) params.set("status", requestedStatus);
      const result = await apiFetch<UsersResponse>(`/api/admin/users?${params.toString()}`);
      setUsers(result.users);
      setWarehouses(result.warehouses);
      setPagination(result.pagination);
      setDrafts(Object.fromEntries(result.users.map((user) => [user.id, user.warehouse_id ?? ""])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được danh sách tài khoản");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    void loadData(page, debouncedSearch, roleFilter, statusFilter);
  }, [debouncedSearch, loadData, page, roleFilter, statusFilter]);

  useEffect(() => {
    setRoleFilter(requestedRole);
    if (requestedRole) {
      setForm((current) => ({ ...current, role_code: requestedRole }));
    }
    setPage(1);
  }, [requestedRole]);

  const filteredUsers = users;
  const totalPages = Math.max(1, pagination.totalPages);
  const firstResult = pagination.total === 0 ? 0 : (page - 1) * pagination.limit + 1;
  const lastResult = Math.min(page * pagination.limit, pagination.total);

  function warehousesForRole(roleCode: string): AssignedWarehouse[] {
    return warehouses.filter((warehouse) => roleCode === RoleCode.DISPATCHER
      ? warehouse.warehouse_level === WarehouseLevelCode.COMMUNE || warehouse.warehouse_level === WarehouseLevelCode.PROVINCE
      : roleCode === RoleCode.DELIVERY_STAFF
        ? warehouse.warehouse_level === WarehouseLevelCode.COMMUNE
        : true);
  }

  async function patchUser(user: AdminUser, body: Record<string, unknown>, success: string): Promise<void> {
    setBusyId(user.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setNotice(success);
      await loadData(page, debouncedSearch, roleFilter, statusFilter);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể cập nhật tài khoản");
    } finally {
      setBusyId(null);
    }
  }

  async function createUser(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ ...form, phone: form.phone || undefined, warehouse_id: form.warehouse_id || null }),
      });
      setNotice(`Đã tạo tài khoản ${form.email}.`);
      setForm((current) => ({ ...current, full_name: "", email: "", password: "", phone: "", warehouse_id: "" }));
      await loadData(page, debouncedSearch, roleFilter, statusFilter);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tạo tài khoản");
    } finally {
      setCreating(false);
    }
  }

  async function saveAssignment(user: AdminUser): Promise<void> {
    const selectedWarehouseId = drafts[user.id] || null;
    setBusyId(user.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ warehouse_id: selectedWarehouseId }),
      });
      setNotice(`Đã cập nhật kho phụ trách cho ${user.full_name}.`);
      await loadData(page, debouncedSearch, roleFilter, statusFilter);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể cập nhật kho phụ trách");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-8 md:py-8">
      <PageHeader
        heading={isDeliveryStaffPage ? "Nhân viên giao hàng" : "Phân công tài khoản vận hành"}
        subtitle={isDeliveryStaffPage ? "Quản lý danh sách nhân viên giao hàng và kho phụ trách." : "Gán điều phối viên, nhân viên giao nhận và nhân viên kho vào đúng kho phụ trách."}
        action={<Button variant="secondary" onClick={() => void loadData(page, debouncedSearch, roleFilter, statusFilter)} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : undefined} /> Làm mới</Button>}
      />

      {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-dt border border-dt-green/30 bg-dt-green/10 px-4 py-3 text-[12px] text-dt-green">{notice}</p> : null}

      {!isDeliveryStaffPage ? (
        <Card className="mt-5 gap-4">
          <CardLabel>Tạo tài khoản mới</CardLabel>
          <form onSubmit={(event) => void createUser(event)} className="grid gap-3 md:grid-cols-3">
            <TextField label="Họ tên" required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
            <TextField label="Email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <TextField label="Mật khẩu (tối thiểu 8 ký tự)" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            <TextField label="Số điện thoại" inputMode="numeric" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            <SelectField label="Vai trò" value={form.role_code} onChange={(event) => setForm({ ...form, role_code: event.target.value, warehouse_id: "" })}>
              {ROLE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </SelectField>
            {OPERATIONAL_ROLES.has(form.role_code) ? (
              <WarehouseAssignmentPicker
                label="Kho phụ trách"
                warehouses={warehousesForRole(form.role_code)}
                value={form.warehouse_id}
                onChange={(warehouse_id) => setForm({ ...form, warehouse_id })}
              />
            ) : <div />}
            <div className="md:col-span-3"><Button type="submit" disabled={creating}>Tạo tài khoản</Button></div>
          </form>
        </Card>
      ) : null}

      <Card className="mt-5 gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardLabel>Tài khoản và phạm vi vận hành</CardLabel>
            <p className="mt-1 text-sm font-semibold">Điều phối viên theo dõi theo tỉnh hoặc kho con được gán</p>
          </div>
          <WarehouseIcon className="text-dt-yellow" size={20} />
        </div>
        <div className="grid max-w-[960px] gap-3 md:grid-cols-3">
          <TextField label="Tìm tài khoản" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên hoặc email" />
          <SelectField label="Lọc theo vai trò" value={roleFilter} onChange={(event) => {
            setPage(1);
            setRoleFilter(event.target.value);
          }}>
            <option value="">Tất cả</option>
            {ROLE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
          </SelectField>
          <SelectField label="Lọc theo trạng thái" value={statusFilter} onChange={(event) => {
            setPage(1);
            setStatusFilter(event.target.value);
          }}>
            {STATUS_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
          </SelectField>
        </div>

        {loading ? <p className="text-[12px] text-dt-muted">Đang tải tài khoản...</p> : null}
        {!loading && filteredUsers.length === 0 ? <p className="rounded-md bg-dt-panel2 p-4 text-[12px] text-dt-muted">Không tìm thấy tài khoản phù hợp.</p> : null}
        {!loading && filteredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-[980px] text-left text-[11px]">
              <div className={`grid ${USER_LIST_GRID_COLUMNS} gap-3 border-b border-dt-border px-2 pb-2 text-[10px] uppercase tracking-wide text-dt-muted`}>
                <div>Tài khoản</div>
                <div>Vai trò (phân quyền)</div>
                <div>Trạng thái</div>
                <div>Tỉnh phụ trách</div>
                <div>Kho hiện tại</div>
                <div className="text-right">Thao tác</div>
              </div>
              {filteredUsers.map((user) => {
                const code = roleCode(user);
                const canAssign = code !== null && OPERATIONAL_ROLES.has(code);
                return (
                  <div key={user.id} className={`grid min-h-[88px] ${USER_LIST_GRID_COLUMNS} items-center gap-3 border-b border-dt-border/70 px-2 py-3 last:border-0`}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-dt-text" title={user.full_name}>{user.full_name}</p>
                      <p className="mt-1 truncate text-[10px] text-dt-muted" title={user.email}>{user.email}</p>
                    </div>
                    <div className="min-w-0">
                      <select aria-label={`Vai trò của ${user.full_name}`} value={code ?? ""} disabled={busyId === user.id} onChange={(event) => {
                        const next = event.target.value;
                        if (next !== code) setPendingRole({ user, roleCode: next });
                      }} className="h-9 w-full min-w-0 rounded-md border border-dt-border bg-dt-panel2 px-2 text-[11px] text-dt-text">
                        {ROLE_OPTIONS.map((option) => <option key={option.code} value={option.code} className="bg-dt-panel2">{option.label}</option>)}
                      </select>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`inline-block max-w-full truncate rounded-full px-2 py-1 text-[10px] ${user.status === "active" ? "bg-dt-green/10 text-dt-green" : "bg-dt-red/10 text-red-300"}`}>{STATUS_LABEL[user.status] ?? user.status}</span>
                      <button type="button" disabled={busyId === user.id} onClick={() => void patchUser(user, { status: user.status === "active" ? "suspended" : "active" }, user.status === "active" ? `Đã khóa ${user.full_name}.` : `Đã mở khóa ${user.full_name}.`)} className="shrink-0 whitespace-nowrap text-[10px] text-dt-yellow no-underline hover:text-dt-text disabled:opacity-50">{user.status === "active" ? "Khóa" : "Mở khóa"}</button>
                    </div>
                    <div className="min-w-0 truncate text-dt-muted" title={user.province ?? "—"}>{user.province ?? "—"}</div>
                    <div className="min-w-0 truncate text-dt-muted" title={warehouseLabel(relationValue(user.warehouses))}>{warehouseLabel(relationValue(user.warehouses))}</div>
                    <div className="grid min-w-0 grid-cols-[58px_minmax(0,155px)_auto] items-center gap-2">
                      <Link href={`/dashboard/admin/users/${user.id}`} className="flex h-9 w-[58px] shrink-0 items-center justify-center whitespace-nowrap rounded-dt border border-dt-yellow/50 text-[10px] text-dt-yellow no-underline hover:border-dt-yellow hover:text-dt-text hover:no-underline focus:no-underline">Chi tiết</Link>
                      {canAssign ? (
                        <WarehouseAssignmentPicker
                          label="Kho"
                          warehouses={warehousesForRole(code)}
                          value={drafts[user.id] ?? ""}
                          onChange={(warehouseId) => setDrafts((current) => ({ ...current, [user.id]: warehouseId }))}
                          onRequestClear={() => {
                            if (!drafts[user.id]) return;
                            const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === drafts[user.id]);
                            setPendingUnassign({
                              user,
                              warehouseName: selectedWarehouse?.name ?? "kho hiện tại",
                            });
                          }}
                          disabled={busyId === user.id}
                          compact
                        />
                      ) : <span className="whitespace-nowrap text-[10px] text-dt-muted">Không áp dụng</span>}
                      {canAssign ? (
                        <Button className="shrink-0 px-3 py-2 text-[11px]" disabled={busyId === user.id} onClick={() => void saveAssignment(user)}><Settings2 size={13} /> Lưu</Button>
                      ) : <span aria-hidden="true" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dt-border pt-4 text-[11px] text-dt-muted">
          <span>Hiển thị {firstResult}–{lastResult} trên {pagination.total} tài khoản</span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="px-3 py-2 text-[11px]"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Trang trước
            </Button>
            <span>Trang {page} / {totalPages}</span>
            <Button
              variant="secondary"
              className="px-3 py-2 text-[11px]"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Trang sau
            </Button>
          </div>
        </div>
      </Card>

      <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-dt-muted"><CheckCircle2 className="mt-0.5 shrink-0 text-dt-green" size={14} />Khi gán kho, hệ thống đồng bộ tỉnh phụ trách theo tỉnh của kho. Tài khoản chưa được gán kho sẽ không nhận được đơn/chặng tại các API vận hành.</p>
      <AdminRoleChangeDialog
        open={pendingRole !== null}
        userName={pendingRole?.user.full_name ?? ""}
        roleName={pendingRole ? roleLabel(pendingRole.roleCode) : ""}
        busy={pendingRole !== null && busyId === pendingRole.user.id}
        onCancel={() => setPendingRole(null)}
        onConfirm={() => {
          if (!pendingRole) return;
          const { user, roleCode: nextRole } = pendingRole;
          setPendingRole(null);
          void patchUser(user, { role_code: nextRole }, `Đã đổi vai trò của ${user.full_name}.`);
        }}
      />
      <AdminWarehouseUnassignDialog
        open={pendingUnassign !== null}
        userName={pendingUnassign?.user.full_name ?? ""}
        warehouseName={pendingUnassign?.warehouseName ?? ""}
        busy={pendingUnassign !== null && busyId === pendingUnassign.user.id}
        onCancel={() => setPendingUnassign(null)}
        onConfirm={() => {
          if (!pendingUnassign) return;
          const { user } = pendingUnassign;
          setPendingUnassign(null);
          void patchUser(user, { warehouse_id: null }, `Đã bỏ gán kho cho ${user.full_name}.`);
        }}
      />
    </div>
  );
}
