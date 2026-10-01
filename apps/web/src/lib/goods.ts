export interface GoodsInput {
  itemName: string;
  itemType: string;
  quantity: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  declaredValue: string;
}

export const GOODS_TYPE_SUGGESTIONS = [
  "Hồ sơ, giấy tờ",
  "Quần áo, phụ kiện",
  "Điện tử",
  "Mỹ phẩm",
  "Gia dụng",
  "Thực phẩm khô",
  "Hàng dễ vỡ",
];

function optionalNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : Number(value);
}

export function validateGoods(input: GoodsInput): string | null {
  if (!input.itemName.trim()) return "Vui lòng nhập tên hàng hóa.";
  if (input.itemName.trim().length > 200) return "Tên hàng hóa không được vượt quá 200 ký tự.";
  if (input.itemType.trim().length > 100) return "Loại hàng không được vượt quá 100 ký tự.";

  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return "Số lượng phải là số nguyên lớn hơn 0.";

  const weight = optionalNumber(input.weight);
  if (weight !== undefined && (!Number.isFinite(weight) || weight <= 0)) return "Khối lượng phải lớn hơn 0 kg.";

  const dimensions = [input.length, input.width, input.height].map(optionalNumber);
  if (dimensions.some((value) => value !== undefined) && dimensions.some((value) => value === undefined)) {
    return "Nếu khai báo kích thước, vui lòng nhập đủ dài, rộng và cao.";
  }
  if (dimensions.some((value) => value !== undefined && (!Number.isFinite(value) || value <= 0))) {
    return "Dài, rộng và cao phải lớn hơn 0 cm.";
  }

  const declaredValue = optionalNumber(input.declaredValue);
  if (declaredValue !== undefined && (!Number.isFinite(declaredValue) || declaredValue < 0)) {
    return "Giá trị khai báo không được âm.";
  }
  return null;
}

export function goodsPayload(input: GoodsInput) {
  return {
    item_name: input.itemName.trim(),
    item_type: input.itemType.trim() || undefined,
    quantity: Number(input.quantity),
    weight: optionalNumber(input.weight),
    length: optionalNumber(input.length),
    width: optionalNumber(input.width),
    height: optionalNumber(input.height),
    declared_value: optionalNumber(input.declaredValue),
  };
}
