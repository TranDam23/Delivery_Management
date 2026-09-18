/**
 * Danh mục tỉnh/thành phố dùng chung cho địa chỉ, kho và phạm vi điều phối.
 *
 * Giá trị lưu xuống database phải lấy trực tiếp từ danh sách này để việc
 * đối chiếu tỉnh giữa đơn hàng, kho, điều phối viên và nhân viên luôn thống
 * nhất. Danh mục này đồng bộ với dữ liệu kho mẫu trong Supabase.
 */
export const VIETNAM_PROVINCES = [
  "Thành phố Cần Thơ",
  "Thành phố Đà Nẵng",
  "Thành phố Hà Nội",
  "Thành phố Hải Phòng",
  "Thành phố Hồ Chí Minh",
  "Thành phố Huế",
  "Tỉnh An Giang",
  "Tỉnh Bắc Ninh",
  "Tỉnh Cà Mau",
  "Tỉnh Cao Bằng",
  "Tỉnh Đắk Lắk",
  "Tỉnh Điện Biên",
  "Tỉnh Đồng Nai",
  "Tỉnh Đồng Tháp",
  "Tỉnh Gia Lai",
  "Tỉnh Hà Tĩnh",
  "Tỉnh Hưng Yên",
  "Tỉnh Khánh Hòa",
  "Tỉnh Lai Châu",
  "Tỉnh Lâm Đồng",
  "Tỉnh Lạng Sơn",
  "Tỉnh Lào Cai",
  "Tỉnh Nghệ An",
  "Tỉnh Ninh Bình",
  "Tỉnh Phú Thọ",
  "Tỉnh Quảng Ngãi",
  "Tỉnh Quảng Ninh",
  "Tỉnh Quảng Trị",
  "Tỉnh Sơn La",
  "Tỉnh Tây Ninh",
  "Tỉnh Thái Nguyên",
  "Tỉnh Thanh Hóa",
  "Tỉnh Tuyên Quang",
  "Tỉnh Vĩnh Long",
] as const;

export type VietnamProvince = (typeof VIETNAM_PROVINCES)[number];

export function isVietnamProvince(value: string): value is VietnamProvince {
  return (VIETNAM_PROVINCES as readonly string[]).includes(value.trim());
}
