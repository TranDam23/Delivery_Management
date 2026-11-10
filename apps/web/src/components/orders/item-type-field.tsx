"use client";

import { useState } from "react";
import { SelectField, TextField } from "@/components/ui/field";
import { isStandardItemType, ITEM_TYPE_MAX_LENGTH, ITEM_TYPE_OPTIONS, ITEM_TYPE_OTHER } from "@/lib/item-types";

interface ItemTypeFieldProps {
  /** Giá trị loại hàng cuối cùng (tên loại có sẵn hoặc tên khách tự nhập); rỗng nếu chưa chọn. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  wrapperClassName?: string;
}

/**
 * Chọn loại hàng theo danh mục của VNPost; chọn "Khác" thì hiện ô để khách tự nhập tên loại hàng.
 * Đơn cũ có loại hàng nhập tự do sẽ mở ở chế độ "Khác" với đúng nội dung đó.
 */
export function ItemTypeField({ value, onChange, label = "Loại hàng", wrapperClassName }: ItemTypeFieldProps): React.JSX.Element {
  const [otherMode, setOtherMode] = useState(() => value.trim() !== "" && !isStandardItemType(value));
  const selected = otherMode ? ITEM_TYPE_OTHER : isStandardItemType(value) ? value : "";

  function handleSelect(next: string): void {
    if (next === ITEM_TYPE_OTHER) {
      setOtherMode(true);
      // Đổi từ loại có sẵn sang "Khác": xóa giá trị để khách nhập tên mới.
      if (isStandardItemType(value)) onChange("");
      return;
    }
    setOtherMode(false);
    onChange(next);
  }

  return (
    <div className={wrapperClassName ?? "flex flex-col gap-3"}>
      <SelectField label={label} value={selected} onChange={(event) => handleSelect(event.target.value)}>
        <option value="">Chọn loại hàng</option>
        {ITEM_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        <option value={ITEM_TYPE_OTHER}>{ITEM_TYPE_OTHER} (tự nhập)</option>
      </SelectField>
      {otherMode ? (
        <TextField
          label="Tên loại hàng"
          required
          value={value}
          maxLength={ITEM_TYPE_MAX_LENGTH}
          placeholder="Ví dụ: quần áo, đồ gia dụng, thực phẩm khô..."
          onChange={(event) => onChange(event.target.value)}
          hint="Nhập loại hàng của bạn nếu không thuộc các loại có sẵn."
        />
      ) : null}
    </div>
  );
}
