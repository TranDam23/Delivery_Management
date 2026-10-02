"use client";

import { CheckCircle2, RefreshCw, Settings2, Warehouse as WarehouseIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleCode, WarehouseLevelCode, type Warehouse } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
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
}

const ROLE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: RoleCode.CUSTOMER, label: "Khách hàng" },
  { code: RoleCode.DELIVERY_STAFF, label: "Nhân viên giao nhận" },
  { code: RoleCode.DISPATCHER, label: "Điều phối viên" },
  { code: RoleCode.WAREHOUSE_STAFF, label: "Nhân viên kho" },
  { code: RoleCode.ADMIN, label: "Quản trị viên" },
];
const STATUS_LABEL: Record<string, string> = { active: "Hoạt động", inactive: "Ngưng hoạt động", suspended: "Đã khóa" };

const OPERATIONAL_ROLES: ReadonlySet<string> = new Set([RoleCode.DISPATCHER, RoleCode.DELIVERY_STAFF, RoleCode.WAREHOUSE_STAFF]);

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
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [warehouses, setWarehouses] = useState<AssignedWarehouse[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [form, setForm] = useState({ full_name: "", email: "", password: "", phone: "", role_code: RoleCode.DELIVERY_STAFF as string, warehouse_id: "" });
  const [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<UsersResponse>("/api/admin/users");
      setUsers(result.users);
      setWarehouses(result.warehouses);
      setDrafts(Object.fromEntries(result.users.map((user) => [user.id, user.warehouse_id ?? ""])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được danh sách tài khoản");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const role = new URLSearchParams(window.location.search).get("role");
    if (role) {
      setRoleFilter(role);
      setForm((current) => ({ ...current, role_code: role }));
    }
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi-VN");
    return users.filter((user) => (!roleFilter || roleCode(user) === roleFilter)
      && (!query || `${user.full_name} ${user.email} ${roleLabel(roleCode(user))}`.toLocaleLowerCase("vi-VN").includes(query)));
  }, [search, roleFilter, users]);

  async function patchUser(user: AdminUser, body: Record<string, unknown>, success: string): Promise<void> {
    setBusyId(user.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setNotice(success);
      await loadData();
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
      await loadData();
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
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể cập nhật kho phụ trách");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-8 md:py-8">
      <PageHeader
        heading="Phân công tài khoản vận hành"
        subtitle="Gán điều phối viên, nhân viên giao nhận và nhân viên kho vào đúng kho phụ trách."
        action={<Button variant="secondary" onClick={() => void loadData()} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : undefined} /> Làm mới</Button>}
      />

      {error ? <p role="alert" className="mt-4 rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-dt border border-dt-green/30 bg-dt-green/10 px-4 py-3 text-[12px] text-dt-green">{notice}</p> : null}

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
          {OPERATIONAL_ROLES.has(form.role_code) ? <SelectField label="Kho phụ trách" value={form.warehouse_id} onChange={(event) => setForm({ ...form, warehouse_id: event.target.value })}>
            <option value="">Chưa gán kho</option>
            {warehouses.filter((warehouse) => form.role_code === RoleCode.DISPATCHER
              ? warehouse.warehouse_level === WarehouseLevelCode.COMMUNE || warehouse.warehouse_level === WarehouseLevelCode.PROVINCE
              : form.role_code === RoleCode.DELIVERY_STAFF ? warehouse.warehouse_level === WarehouseLevelCode.COMMUNE : true)
              .map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouseLabel(warehouse)} · {warehouse.province}</option>)}
          </SelectField> : <div />}
          <div className="md:col-span-3"><Button type="submit" disabled={creating}>Tạo tài khoản</Button></div>
        </form>
      </Card>

      <Card className="mt-5 gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardLabel>Tài khoản và phạm vi vận hành</CardLabel>
            <p className="mt-1 text-sm font-semibold">Điều phối viên theo dõi theo tỉnh hoặc kho con được gán</p>
          </div>
          <WarehouseIcon className="text-dt-yellow" size={20} />
        </div>
        <div className="grid max-w-[640px] gap-3 md:grid-cols-2">
          <TextField label="Tìm tài khoản" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên, email hoặc vai trò" />
          <SelectField label="Lọc theo vai trò" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="">Tất cả</option>
            {ROLE_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
          </SelectField>
        </div>

        {loading ? <p className="text-[12px] text-dt-muted">Đang tải tài khoản...</p> : null}
        {!loading && filteredUsers.length === 0 ? <p className="rounded-md bg-dt-panel2 p-4 text-[12px] text-dt-muted">Không tìm thấy tài khoản phù hợp.</p> : null}
        {!loading && filteredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-[11px]">
              <thead className="border-b border-dt-border text-[10px] uppercase tracking-wide text-dt-muted">
                <tr><th className="py-2 font-medium">Tài khoản</th><th className="py-2 font-medium">Vai trò (phân quyền)</th><th className="py-2 font-medium">Trạng thái</th><th className="py-2 font-medium">Tỉnh phụ trách</th><th className="py-2 font-medium">Kho hiện tại</th><th className="py-2 text-right font-medium">Thao tác</th></tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const code = roleCode(user);
                  const canAssign = code !== null && OPERATIONAL_ROLES.has(code);
                  return (
                    <tr key={user.id} className="border-b border-dt-border/70 last:border-0">
                      <td className="py-3"><p className="font-semibold text-dt-text">{user.full_name}</p><p className="mt-1 text-[10px] text-dt-muted">{user.email}</p></td>
                      <td className="py-3">
                        <select aria-label={`Vai trò của ${user.full_name}`} value={code ?? ""} disabled={busyId === user.id} onChange={(event) => {
                          const next = event.target.value;
                          if (next !== code && window.confirm(`Đổi vai trò của ${user.full_name} thành "${roleLabel(next)}"?`)) void patchUser(user, { role_code: next }, `Đã đổi vai trò của ${user.full_name}.`);
                        }} className="h-9 rounded-md border border-dt-border bg-dt-panel2 px-2 text-[11px] text-dt-text">
                          {ROLE_OPTIONS.map((option) => <option key={option.code} value={option.code} className="bg-dt-panel2">{option.label}</option>)}
                        </select>
                      </td>
                      <td className="py-3">
                        <span className={`rounded-full px-2 py-1 text-[10px] ${user.status === "active" ? "bg-dt-green/10 text-dt-green" : "bg-dt-red/10 text-red-300"}`}>{STATUS_LABEL[user.status] ?? user.status}</span>
                        <button type="button" disabled={busyId === user.id} onClick={() => void patchUser(user, { status: user.status === "active" ? "suspended" : "active" }, user.status === "active" ? `Đã khóa ${user.full_name}.` : `Đã mở khóa ${user.full_name}.`)} className="ml-2 text-[10px] text-dt-yellow underline disabled:opacity-50">{user.status === "active" ? "Khóa" : "Mở khóa"}</button>
                      </td>
                      <td className="py-3 text-dt-muted">{user.province ?? "—"}</td>
                      <td className="py-3 text-dt-muted">{warehouseLabel(relationValue(user.warehouses))}</td>
                      <td className="py-3 text-right">
                        {canAssign ? (
                          <div className="flex items-center justify-end gap-2">
                            <select aria-label={`Chọn kho cho ${user.full_name}`} value={drafts[user.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: event.target.value }))} className="h-9 max-w-[360px] rounded-dt border border-dt-border bg-dt-panel2 px-2 text-[11px] text-dt-text">
                              <option value="" className="bg-dt-panel2">Bỏ gán kho</option>
                              {warehouses
                                .filter((warehouse) => code === RoleCode.DISPATCHER
                                  ? warehouse.warehouse_level === WarehouseLevelCode.COMMUNE || warehouse.warehouse_level === WarehouseLevelCode.PROVINCE
                                  : code === RoleCode.DELIVERY_STAFF
                                    ? warehouse.warehouse_level === WarehouseLevelCode.COMMUNE
                                    : true)
                                .map((warehouse) => <option key={warehouse.id} value={warehouse.id} className="bg-dt-panel2">{warehouseLabel(warehouse)} · {warehouse.province}</option>)}
                            </select>
                            <Button className="px-3 py-2 text-[11px]" disabled={busyId === user.id} onClick={() => void saveAssignment(user)}><Settings2 size={13} /> Lưu</Button>
                          </div>
                        ) : <span className="text-[10px] text-dt-muted">Không áp dụng</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-dt-muted"><CheckCircle2 className="mt-0.5 shrink-0 text-dt-green" size={14} />Khi gán kho, hệ thống đồng bộ tỉnh phụ trách theo tỉnh của kho. Tài khoản chưa được gán kho sẽ không nhận được đơn/chặng tại các API vận hành.</p>
    </div>
  );
}
