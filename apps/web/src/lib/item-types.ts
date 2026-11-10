/**
 * Loại hàng gửi theo trang tính cước của VNPost (vietnampost.vn, mục Chuyển phát > Ước tính cước phí):
 * "Hàng Hóa" và "Thư tài liệu". Loại hàng khác do khách tự nhập (chọn "Khác").
 * Giá trị lưu vào order_items.item_type chính là chuỗi hiển thị, nên đơn cũ nhập tự do vẫn đọc được.
 */
export const ITEM_TYPE_OPTIONS = ["Hàng hóa", "Thư/Tài liệu"] as const;

export const ITEM_TYPE_OTHER = "Khác";

export const ITEM_TYPE_MAX_LENGTH = 100;

export const ITEM_TYPE_DOCUMENT = "Thư/Tài liệu";

/**
 * Hàng hóa (và loại hàng khác/chưa chọn) bắt buộc nhập đủ dài, rộng, cao để tính cước theo thể tích;
 * thư/tài liệu mỏng nhẹ chỉ cần khối lượng. Khối lượng luôn bắt buộc.
 */
export function dimensionsRequired(itemType: string | null | undefined): boolean {
  return (itemType ?? "").trim() !== ITEM_TYPE_DOCUMENT;
}

export const WEIGHT_REQUIRED_MESSAGE = "Vui lòng nhập khối lượng (kg) của hàng hóa để tính cước.";
export const DIMENSIONS_REQUIRED_MESSAGE = "Hàng hóa cần nhập đủ chiều dài, chiều rộng và chiều cao (cm) để tính cước. Riêng thư/tài liệu chỉ cần khối lượng.";

export function isStandardItemType(value: string): boolean {
  return (ITEM_TYPE_OPTIONS as readonly string[]).includes(value);
}
