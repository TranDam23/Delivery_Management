import { Card, CardLabel } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { GOODS_TYPE_SUGGESTIONS, type GoodsInput } from "@/lib/goods";

interface GoodsFieldsProps {
  value: GoodsInput;
  note: string;
  onChange: (field: keyof GoodsInput, value: string) => void;
  onNoteChange: (value: string) => void;
}

export function GoodsFields({ value, note, onChange, onNoteChange }: GoodsFieldsProps): React.JSX.Element {
  return (
    <>
      <Card>
        <CardLabel>Hàng hóa</CardLabel>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <TextField label="Tên hàng hóa" required maxLength={200} value={value.itemName} placeholder="Ví dụ: Hồ sơ hợp đồng" onChange={(event) => onChange("itemName", event.target.value)} />
          <TextField label="Loại hàng" list="goods-type-suggestions" maxLength={100} value={value.itemType} placeholder="Chọn hoặc nhập loại khác" onChange={(event) => onChange("itemType", event.target.value)} />
          <datalist id="goods-type-suggestions">{GOODS_TYPE_SUGGESTIONS.map((type) => <option key={type} value={type} />)}</datalist>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Số lượng" type="number" min="1" step="1" required value={value.quantity} onChange={(event) => onChange("quantity", event.target.value)} />
          <TextField label="Khối lượng mỗi món (kg)" type="number" min="0.01" step="0.01" value={value.weight} placeholder="Không bắt buộc" onChange={(event) => onChange("weight", event.target.value)} />
          <TextField label="Giá trị khai báo (đ)" type="number" min="0" step="1000" value={value.declaredValue} placeholder="Không bắt buộc" onChange={(event) => onChange("declaredValue", event.target.value)} />
        </div>
        <div>
          <p className="mb-2 text-[11px] font-medium text-dt-muted">Kích thước kiện hàng (cm, không bắt buộc)</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Dài" type="number" min="0.01" step="0.01" value={value.length} onChange={(event) => onChange("length", event.target.value)} />
            <TextField label="Rộng" type="number" min="0.01" step="0.01" value={value.width} onChange={(event) => onChange("width", event.target.value)} />
            <TextField label="Cao" type="number" min="0.01" step="0.01" value={value.height} onChange={(event) => onChange("height", event.target.value)} />
          </div>
          <p className="mt-2 text-[10px] text-dt-muted">Nếu nhập kích thước, cần nhập đủ cả ba chiều.</p>
        </div>
      </Card>
      <Card>
        <CardLabel>Ghi chú giao hàng</CardLabel>
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-dt-muted">Lưu ý cho đơn hàng</span>
          <textarea value={note} maxLength={1000} onChange={(event) => onNoteChange(event.target.value)} placeholder="Ví dụ: Gọi trước khi giao, hàng dễ vỡ..." rows={4} className="w-full resize-y rounded-dt border border-dt-border bg-dt-panel2 px-3 py-3 text-[13px] text-dt-text placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none" />
        </label>
      </Card>
    </>
  );
}
