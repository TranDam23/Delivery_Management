"use client";

import { Check, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";

type AreaLevel = "PROVINCE" | "DISTRICT" | "WARD";

interface Area {
  id: string;
  level: AreaLevel;
  name: string;
  parent_id: string | null;
  status: "active" | "inactive";
  warehouse_count: number;
}

interface RegionPayload {
  items: Area[];
  canManageProvinces: boolean;
}

const LEVEL_LABEL: Record<AreaLevel, string> = {
  PROVINCE: "Tỉnh / Thành phố",
  DISTRICT: "Quận / Huyện",
  WARD: "Phường / Xã",
};

function sortByName(items: Area[]): Area[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, "vi"));
}

interface ColumnProps {
  level: AreaLevel;
  items: Area[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
  canManage: boolean;
  canAdd: boolean;
  emptyHint: string;
  searchable?: boolean;
  busy: boolean;
  onAdd: (name: string) => Promise<boolean>;
  onRename: (area: Area, name: string) => Promise<boolean>;
  onToggle: (area: Area) => void;
  onDelete: (area: Area) => void;
}

function AreaColumn(props: ColumnProps): React.JSX.Element {
  const { level, items, selectedId, onSelect, canManage, canAdd, emptyHint, searchable, busy } = props;
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi-VN");
    return keyword ? items.filter((item) => item.name.toLocaleLowerCase("vi-VN").includes(keyword)) : items;
  }, [items, query]);

  async function submitAdd(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!newName.trim()) return;
    if (await props.onAdd(newName)) setNewName("");
  }

  async function submitRename(area: Area): Promise<void> {
    if (await props.onRename(area, editName)) setEditingId(null);
  }

  return (
    <Card className="min-h-[360px]">
      <CardLabel>{LEVEL_LABEL[level]} ({items.length})</CardLabel>
      {searchable ? (
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dt-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên"
            aria-label={`Tìm ${LEVEL_LABEL[level]}`}
            className="h-[36px] w-full rounded-dt border border-dt-border bg-dt-panel2 pl-8 pr-3 text-[12px] text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none"
          />
        </div>
      ) : null}

      <ul className="flex max-h-[420px] flex-col gap-1 overflow-y-auto">
        {visible.length === 0 ? <li className="py-6 text-center text-[12px] text-dt-muted">{emptyHint}</li> : null}
        {visible.map((area) => {
          const selected = area.id === selectedId;
          const editing = editingId === area.id;
          return (
            <li
              key={area.id}
              className={`flex items-center gap-2 rounded-dt border px-3 py-2 text-[12px] ${selected ? "border-dt-yellow bg-dt-yellow/10" : "border-dt-border bg-dt-panel2"}`}
            >
              {editing ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void submitRename(area);
                      if (event.key === "Escape") setEditingId(null);
                    }}
                    aria-label="Tên mới"
                    className="h-[30px] min-w-0 flex-1 rounded-dt border border-dt-border bg-dt-panel px-2 text-[12px] text-dt-text focus:border-dt-yellow focus:outline-none"
                  />
                  <button type="button" aria-label="Lưu tên" disabled={busy} onClick={() => void submitRename(area)} className="text-dt-green"><Check size={14} /></button>
                  <button type="button" aria-label="Hủy sửa" onClick={() => setEditingId(null)} className="text-dt-muted"><X size={14} /></button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!onSelect}
                    onClick={() => onSelect?.(area.id)}
                    className={`min-w-0 flex-1 truncate text-left ${onSelect ? "cursor-pointer" : "cursor-default"} ${area.status === "inactive" ? "text-dt-muted line-through" : "text-dt-text"}`}
                  >
                    {area.name}
                  </button>
                  {area.warehouse_count > 0 ? <span className="shrink-0 text-[10px] text-dt-muted">{area.warehouse_count} kho</span> : null}
                  {canManage ? (
                    <>
                      <button type="button" aria-label={`Sửa ${area.name}`} onClick={() => { setEditingId(area.id); setEditName(area.name); }} className="text-dt-muted hover:text-dt-text"><Pencil size={13} /></button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => props.onToggle(area)}
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${area.status === "active" ? "bg-dt-green/10 text-dt-green" : "bg-white/5 text-dt-muted"}`}
                      >
                        {area.status === "active" ? "Hoạt động" : "Tạm dừng"}
                      </button>
                      <button type="button" aria-label={`Xóa ${area.name}`} disabled={busy} onClick={() => props.onDelete(area)} className="text-dt-muted hover:text-red-300"><Trash2 size={13} /></button>
                    </>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {canManage && canAdd ? (
        <form onSubmit={(event) => void submitAdd(event)} className="mt-auto flex gap-2 pt-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={`Thêm ${LEVEL_LABEL[level].toLowerCase()}`}
            aria-label={`Tên ${LEVEL_LABEL[level]} mới`}
            maxLength={120}
            className="h-[36px] min-w-0 flex-1 rounded-dt border border-dt-border bg-dt-panel2 px-3 text-[12px] text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none"
          />
          <Button type="submit" disabled={busy || !newName.trim()} className="px-3 py-2 text-[12px]"><Plus size={13} /> Thêm</Button>
        </form>
      ) : null}
    </Card>
  );
}

export function RegionManagementPage(): React.JSX.Element {
  const [areas, setAreas] = useState<Area[]>([]);
  const [canManageProvinces, setCanManageProvinces] = useState(false);
  const [provinceId, setProvinceId] = useState<string | null>(null);
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<RegionPayload>("/api/regions");
      setAreas(payload.items);
      setCanManageProvinces(payload.canManageProvinces);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được danh mục khu vực");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const provinces = useMemo(() => sortByName(areas.filter((area) => area.level === "PROVINCE")), [areas]);
  // Điều phối viên chỉ nhận về đúng một tỉnh nên tự chọn sẵn.
  const activeProvinceId = provinceId ?? (provinces.length === 1 ? provinces[0]?.id ?? null : null);
  const districts = useMemo(() => sortByName(areas.filter((area) => area.level === "DISTRICT" && area.parent_id === activeProvinceId)), [areas, activeProvinceId]);
  const activeDistrictId = districtId && districts.some((area) => area.id === districtId) ? districtId : null;
  // Phường/xã nằm dưới quận/huyện đã chọn; nếu chưa chọn quận thì hiện phường/xã trực thuộc tỉnh (mô hình 2 cấp).
  const wardParentId = activeDistrictId ?? activeProvinceId;
  const wards = useMemo(() => sortByName(areas.filter((area) => area.level === "WARD" && area.parent_id === wardParentId)), [areas, wardParentId]);

  async function mutate(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Thao tác không thành công");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const add = (level: AreaLevel, parentId: string | null) => (name: string): Promise<boolean> =>
    mutate(() => apiFetch("/api/regions", { method: "POST", body: JSON.stringify({ level, name, parent_id: parentId }) }), "Đã thêm khu vực.");
  const rename = (area: Area, name: string): Promise<boolean> =>
    name.trim() === area.name
      ? Promise.resolve(true)
      : mutate(() => apiFetch(`/api/regions/${area.id}`, { method: "PATCH", body: JSON.stringify({ name }) }), "Đã đổi tên khu vực.");
  const toggle = (area: Area): void => {
    void mutate(
      () => apiFetch(`/api/regions/${area.id}`, { method: "PATCH", body: JSON.stringify({ status: area.status === "active" ? "inactive" : "active" }) }),
      area.status === "active" ? "Đã tạm dừng khu vực." : "Đã kích hoạt khu vực.",
    );
  };
  const remove = (area: Area): void => {
    if (!window.confirm(`Xóa "${area.name}"? Thao tác này không thể hoàn tác.`)) return;
    void mutate(() => apiFetch(`/api/regions/${area.id}`, { method: "DELETE" }), "Đã xóa khu vực.");
  };

  return (
    <div className="min-h-screen bg-dt-bg text-dt-text">
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-5 py-6 md:px-8 md:py-8">
        <PageHeader
          heading="Quản lý khu vực"
          subtitle="Danh mục tỉnh/thành phố, quận/huyện (nếu có) và phường/xã phục vụ phân loại đơn hàng và mạng kho."
          action={<Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={14} /> Tải lại</Button>}
        />
        {error ? <p role="alert" className="rounded-dt border border-dt-red/40 bg-dt-red/10 px-4 py-3 text-[12px] text-red-200">{error}</p> : null}
        {notice ? <p role="status" className="rounded-dt border border-dt-green/30 bg-dt-green/10 px-4 py-3 text-[12px] text-dt-green">{notice}</p> : null}
        <p className="text-[11px] text-dt-muted">
          Khu vực đang có kho hoặc địa chỉ sử dụng không thể xóa hay đổi tên; hãy chuyển sang &quot;Tạm dừng&quot;. {canManageProvinces ? "" : "Bạn chỉ quản lý quận/huyện và phường/xã trong tỉnh phụ trách."}
        </p>

        {loading ? <p className="text-[12px] text-dt-muted">Đang tải...</p> : (
          <div className="grid gap-4 lg:grid-cols-3">
            <AreaColumn
              level="PROVINCE"
              items={provinces}
              selectedId={activeProvinceId}
              onSelect={(id) => { setProvinceId(id); setDistrictId(null); }}
              canManage={canManageProvinces}
              canAdd
              searchable
              emptyHint="Chưa có tỉnh/thành phố"
              busy={busy}
              onAdd={add("PROVINCE", null)}
              onRename={rename}
              onToggle={toggle}
              onDelete={remove}
            />
            <AreaColumn
              level="DISTRICT"
              items={districts}
              selectedId={activeDistrictId}
              onSelect={(id) => setDistrictId((current) => (current === id ? null : id))}
              canManage
              canAdd={Boolean(activeProvinceId)}
              searchable
              emptyHint={activeProvinceId ? "Tỉnh này chưa có quận/huyện" : "Chọn một tỉnh/thành phố"}
              busy={busy}
              onAdd={add("DISTRICT", activeProvinceId)}
              onRename={rename}
              onToggle={toggle}
              onDelete={remove}
            />
            <AreaColumn
              level="WARD"
              items={wards}
              selectedId={null}
              canManage
              canAdd={Boolean(wardParentId)}
              searchable
              emptyHint={wardParentId ? "Chưa có phường/xã" : "Chọn một tỉnh/thành phố"}
              busy={busy}
              onAdd={add("WARD", wardParentId)}
              onRename={rename}
              onToggle={toggle}
              onDelete={remove}
            />
          </div>
        )}
      </main>
    </div>
  );
}
