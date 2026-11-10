/**
 * Loại hàng gửi theo trang tính cước của VNPost (vietnampost.vn, mục Chuyển phát > Ước tính cước phí):
 * "Hàng Hóa" và "Thư tài liệu". Loại hàng khác do khách tự nhập (chọn "Khác").
 * Giá trị lưu vào order_items.item_type chính là chuỗi hiển thị, nên đơn cũ nhập tự do vẫn đọc được.
 */
export const ITEM_TYPE_OPTIONS = ["Hàng hóa", "Thư/Tài liệu"] as const;

export const ITEM_TYPE_OTHER = "Khác";

export const ITEM_TYPE_MAX_LENGTH = 100;

export function isStandardItemType(value: string): boolean {
  return (ITEM_TYPE_OPTIONS as readonly string[]).includes(value);
}
