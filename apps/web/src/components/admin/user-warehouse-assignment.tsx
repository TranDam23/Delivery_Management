"use client";

import { CheckCircle2, RefreshCw, Settings2, Warehouse as WarehouseIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoleCode, WarehouseLevelCode, type Warehouse } from "@delivery/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
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

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi-VN");
    if (!query) return users;
    return users.filter((user) => `${user.full_name} ${user.email} ${roleLabel(roleCode(user))}`.toLocaleLowerCase("vi-VN").includes(query));
  }, [search, users]);

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardLabel>Tài khoản và phạm vi vận hành</CardLabel>
            <p className="mt-1 text-sm font-semibold">Điều phối viên theo dõi theo tỉnh hoặc kho con được gán</p>
          </div>
          <WarehouseIcon className="text-dt-yellow" size={20} />
        </div>
        <div className="max-w-[420px]"><TextField label="Tìm tài khoản" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên, email hoặc vai trò" /></div>

        {loading ? <p className="text-[12px] text-dt-muted">Đang tải tài khoản...</p> : null}
        {!loading && filteredUsers.length === 0 ? <p className="rounded-md bg-dt-panel2 p-4 text-[12px] text-dt-muted">Không tìm thấy tài khoản phù hợp.</p> : null}
        {!loading && filteredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-[11px]">
              <thead className="border-b border-dt-border text-[10px] uppercase tracking-wide text-dt-muted">
                <tr><th className="py-2 font-medium">Tài khoản</th><th className="py-2 font-medium">Vai trò</th><th className="py-2 font-medium">Tỉnh phụ trách</th><th className="py-2 font-medium">Kho hiện tại</th><th className="py-2 text-right font-medium">Thao tác</th></tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const code = roleCode(user);
                  const canAssign = code !== null && OPERATIONAL_ROLES.has(code);
                  return (
                    <tr key={user.id} className="border-b border-dt-border/70 last:border-0">
                      <td className="py-3"><p className="font-semibold text-dt-text">{user.full_name}</p><p className="mt-1 text-[10px] text-dt-muted">{user.email}</p></td>
                      <td className="py-3"><span className="rounded-full bg-dt-yellow/10 px-2 py-1 text-[10px] text-dt-yellow">{roleLabel(code)}</span></td>
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
