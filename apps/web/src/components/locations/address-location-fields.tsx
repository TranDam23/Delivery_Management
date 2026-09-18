"use client";

import { useEffect, useMemo, useState } from "react";
import { VIETNAM_PROVINCES } from "@delivery/shared";
import { SelectField } from "@/components/ui/field";
import { apiFetch } from "@/lib/api-client";

export interface AddressLocationValue {
  province: string;
  district: string;
  ward: string;
}

interface LocationCatalog {
  provinces: string[];
  districts: Record<string, string[]>;
  wards: Record<string, Record<string, string[]>>;
  wardsByProvince: Record<string, string[]>;
}

interface AddressLocationFieldsProps {
  value: AddressLocationValue;
  onChange: (value: AddressLocationValue) => void;
  required?: boolean;
  districtRequired?: boolean;
  disabled?: boolean;
  wrapperClassName?: string;
}

function withCurrentValue(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}

/**
 * Bộ chọn địa chỉ dùng chung. Dữ liệu được lấy từ database qua /api/locations
 * để tỉnh, quận/huyện và xã/phường luôn đi cùng danh mục kho thực tế.
 */
export function AddressLocationFields({
  value,
  onChange,
  required = true,
  districtRequired = false,
  disabled = false,
  wrapperClassName,
}: AddressLocationFieldsProps): React.JSX.Element {
  const [catalog, setCatalog] = useState<LocationCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<LocationCatalog>("/api/locations")
      .then((result) => {
        if (mounted) setCatalog(result);
      })
      .catch((caught) => {
        if (mounted) setLoadError(caught instanceof Error ? caught.message : "Không tải được danh mục địa chỉ");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const provinces = useMemo(
    () => withCurrentValue(catalog?.provinces ?? [...VIETNAM_PROVINCES], value.province),
    [catalog?.provinces, value.province],
  );
  const districts = useMemo(
    () => withCurrentValue(catalog?.districts[value.province] ?? [], value.district),
    [catalog?.districts, value.district, value.province],
  );
  const wards = useMemo(() => {
    const provinceWardMap = catalog?.wards[value.province];
    const districtWards = value.district ? provinceWardMap?.[value.district] : undefined;
    const provinceWards = catalog?.wardsByProvince[value.province] ?? [];
    // Khi đã chọn quận/huyện, không trộn xã/phường của quận khác vào danh sách.
    // Nếu database chưa có quan hệ con tương ứng thì để trống để người dùng biết
    // danh mục khu vực cần được bổ sung, thay vì lưu sai tuyến.
    const availableWards = value.district ? (districtWards ?? []) : provinceWards;
    return withCurrentValue(availableWards, value.ward);
  }, [catalog?.wards, catalog?.wardsByProvince, value.district, value.province, value.ward]);

  const hasDistrictOptions = districts.length > 0;
  const hasWardOptions = wards.length > 0;

  return (
    <div className={wrapperClassName ?? "grid gap-3 md:grid-cols-3"}>
      <SelectField
        label="Tỉnh/Thành phố"
        required={required}
        value={value.province}
        disabled={disabled}
        onChange={(event) => onChange({ province: event.target.value, district: "", ward: "" })}
        hint={loadError ?? undefined}
      >
        <option value="" className="bg-dt-panel2">Chọn tỉnh/thành phố</option>
        {provinces.map((province) => (
          <option key={province} value={province} className="bg-dt-panel2">{province}</option>
        ))}
      </SelectField>

      <SelectField
        label="Quận/Huyện"
        required={districtRequired}
        value={value.district}
        disabled={disabled || !value.province || (!hasDistrictOptions && !value.district)}
        onChange={(event) => onChange({ province: value.province, district: event.target.value, ward: "" })}
        hint={!loadError && value.province && !hasDistrictOptions ? "Chưa có quận/huyện trong dữ liệu; có thể để trống theo địa chỉ 2 cấp." : undefined}
      >
        <option value="" className="bg-dt-panel2">{value.province ? "Chọn quận/huyện" : "Chọn tỉnh trước"}</option>
        {districts.map((district) => (
          <option key={district} value={district} className="bg-dt-panel2">{district}</option>
        ))}
      </SelectField>

      <SelectField
        label="Xã/Phường"
        required={required}
        value={value.ward}
        disabled={disabled || !value.province || !hasWardOptions}
        onChange={(event) => onChange({ province: value.province, district: value.district, ward: event.target.value })}
        hint={!loadError && value.province && !hasWardOptions ? (value.district ? "Chưa có xã/phường thuộc quận/huyện này trong dữ liệu kho." : "Chưa có xã/phường trong dữ liệu kho.") : undefined}
      >
        <option value="" className="bg-dt-panel2">{value.district || value.province ? "Chọn xã/phường" : "Chọn tỉnh trước"}</option>
        {wards.map((ward) => (
          <option key={ward} value={ward} className="bg-dt-panel2">{ward}</option>
        ))}
      </SelectField>
    </div>
  );
}
