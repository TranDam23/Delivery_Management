-- ============================================================================
-- GĐ1 — Nhóm Người gửi/nhận: hoàn thiện bảng contacts cho sổ địa chỉ.
--
-- Đặc tả (YeuCau mục 10) yêu cầu một liên hệ có thể là người gửi, người nhận
-- hoặc CẢ HAI, và có thêm trường email. Schema gốc mới chỉ có 'sender' và
-- 'receiver' nên khách hàng buộc phải tạo hai liên hệ trùng nhau cho cùng một
-- người — đúng thứ dữ liệu nhân bản mà docs/PHOI-HOP.md mục 2.1 muốn tránh.
-- ============================================================================

-- 1) Vai trò "Cả hai".
-- Không dùng giá trị mới này ở bất kỳ câu lệnh nào phía dưới: Postgres chỉ
-- cho phép đọc một enum value sau khi transaction thêm nó đã commit.
alter type contact_type add value if not exists 'both';

-- 2) Email liên hệ. Nullable vì người nhận thường chỉ có số điện thoại
-- (đặc tả mục 15: người nhận không bắt buộc phải có tài khoản).
alter table contacts add column if not exists email text;

-- 3) Chặn nhân bản liên hệ trong sổ địa chỉ của cùng một khách hàng.
-- Chỉ ràng buộc contact có chủ sở hữu; contact do điều phối tạo hộ
-- (user_id null) không nằm trong sổ địa chỉ của ai nên không bị chặn.
create unique index if not exists idx_contacts_user_id_phone
  on contacts (user_id, phone)
  where user_id is not null;

-- 4) Tìm kiếm theo tên trong sổ địa chỉ (CUSTOMER-09).
create index if not exists idx_contacts_name on contacts (name);
