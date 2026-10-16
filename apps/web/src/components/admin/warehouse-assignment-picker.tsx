"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { TextField } from "@/components/ui/field";

export interface WarehousePickerItem {
  id: string;
  code: string;
  name: string;
  province: string;
  warehouse_level: string;
}

interface WarehouseAssignmentPickerProps {
  warehouses: WarehousePickerItem[];
  value: string;
  onChange: (warehouseId: string) => void;
  onRequestClear?: () => void;
  label: string;
  disabled?: boolean;
  compact?: boolean;
}

const LARGE_LIST_THRESHOLD = 20;

export function WarehouseAssignmentPicker({
  warehouses,
  value,
  onChange,
  onRequestClear,
  label,
  disabled = false,
  compact = false,
}: WarehouseAssignmentPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === value);
  const filteredWarehouses = useMemo(() => warehouses.filter((warehouse) => (
    !normalizedSearch
    || warehouse.name.toLocaleLowerCase().includes(normalizedSearch)
    || warehouse.code.toLocaleLowerCase().includes(normalizedSearch)
    || warehouse.province.toLocaleLowerCase().includes(normalizedSearch)
  )), [normalizedSearch, warehouses]);
  const shouldRequireSearch = warehouses.length > LARGE_LIST_THRESHOLD && !normalizedSearch;
  const results = shouldRequireSearch ? [] : filteredWarehouses;

  if (!open) {
    return (
      <div className={compact ? "relative flex w-[155px] min-w-0 max-w-full items-center" : "relative min-w-0 max-w-full md:col-span-2"}>
        {!compact ? <span className="mb-[6px] block text-[11px] font-medium text-dt-muted">{label}</span> : null}
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-8 w-auto max-w-full items-center justify-center gap-1 rounded-dt border border-dt-border bg-dt-panel2 px-2 text-left text-[11px] leading-none text-dt-text hover:border-dt-muted disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => setOpen(true)}
        >
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-dt-muted">
            {selectedWarehouse ? "Đổi kho" : "Chọn kho"} <ChevronDown size={15} aria-hidden="true" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? "relative flex w-[155px] min-w-0 max-w-full items-center" : "relative min-w-0 max-w-full md:col-span-2"}>
      <div className="flex h-8 items-center justify-start rounded-dt border border-dt-yellow bg-dt-panel2 px-2 text-[11px] text-dt-muted">
        <button
          type="button"
          disabled={disabled}
          aria-label="Đóng tìm kiếm kho"
          className="inline-flex shrink-0 items-center gap-1 leading-none hover:text-dt-text disabled:opacity-50"
          onClick={() => {
            setSearch("");
            setOpen(false);
          }}
        >
          {selectedWarehouse ? "Đổi kho" : "Chọn kho"} <X size={15} />
        </button>
      </div>
      <div className={`absolute top-[calc(100%+6px)] z-40 w-[min(320px,calc(100vw-32px))] max-w-[calc(100vw-32px)] min-w-0 rounded-dt border border-dt-border bg-dt-panel p-2 shadow-2xl ${compact ? "right-0" : "left-0"}`}>
        <div className="relative">
          <TextField
            label="Tìm kho"
            aria-label={`${label}: tìm theo tên, mã hoặc địa điểm`}
            placeholder="Tên, mã kho hoặc tỉnh"
            value={search}
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
          <Search size={15} className="pointer-events-none absolute left-3 top-[30px] text-dt-muted" aria-hidden="true" />
        </div>
        <button
          type="button"
          disabled={disabled}
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-dt-muted hover:text-dt-text disabled:opacity-50"
          onClick={() => {
            setSearch("");
            setOpen(false);
          }}
        >
          <X size={13} aria-hidden="true" /> Hủy tìm kiếm
        </button>
        <div className="mt-2 max-h-52 min-w-0 max-w-full overflow-y-auto rounded-dt border border-dt-border bg-dt-panel2 p-1">
        <button
          type="button"
          disabled={disabled}
          className={`w-full rounded-dt px-3 py-2 text-left text-[12px] ${value === "" ? "bg-dt-yellow/15 text-dt-yellow" : "text-dt-muted hover:bg-dt-panel"}`}
          onClick={() => {
            if (onRequestClear) {
              onRequestClear();
              setSearch("");
              setOpen(false);
              return;
            }
            onChange("");
            setSearch("");
            setOpen(false);
          }}
        >
          Bỏ gán kho
        </button>
        {selectedWarehouse && !results.some((warehouse) => warehouse.id === selectedWarehouse.id) ? (
          <WarehouseOption warehouse={selectedWarehouse} selected onChange={(warehouseId) => {
            onChange(warehouseId);
            setSearch("");
            setOpen(false);
          }} disabled={disabled} />
        ) : null}
        {results.map((warehouse) => (
          <WarehouseOption
            key={warehouse.id}
            warehouse={warehouse}
            selected={warehouse.id === value}
            onChange={(warehouseId) => {
              onChange(warehouseId);
              setSearch("");
              setOpen(false);
            }}
            disabled={disabled}
          />
        ))}
        {shouldRequireSearch ? (
          <p className="px-3 py-3 text-[11px] text-dt-muted">Nhập tên, mã kho hoặc tỉnh để tìm kiếm.</p>
        ) : null}
        {!shouldRequireSearch && results.length === 0 && !selectedWarehouse ? (
          <p className="px-3 py-3 text-[11px] text-dt-muted">Không tìm thấy kho phù hợp.</p>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function WarehouseOption({
  warehouse,
  selected,
  onChange,
  disabled,
}: {
  warehouse: WarehousePickerItem;
  selected: boolean;
  onChange: (warehouseId: string) => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`mt-1 min-w-0 max-w-full break-words rounded-dt px-3 py-2 text-left ${selected ? "bg-dt-yellow/15 ring-1 ring-dt-yellow/50" : "hover:bg-dt-panel"}`}
      onClick={() => onChange(warehouse.id)}
    >
      <span className="block min-w-0 break-words text-[12px] font-semibold text-dt-text">{warehouse.name}</span>
      <span className="mt-0.5 block min-w-0 break-words text-[11px] text-dt-muted">{warehouse.code} · {warehouse.province}</span>
    </button>
  );
}
