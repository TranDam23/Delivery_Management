-- ============================================================================
-- Tài khoản test cho kịch bản 3 đơn Hà Nội -> Đà Nẵng / Nha Trang / TP.HCM
-- (xem docs/KICH-BAN-TEST-GIAO-HANG-HA-NOI.md).
--
-- Đây là script thao tác thủ công, KHÔNG phải migration.
-- Cách dùng: Supabase Dashboard > SQL Editor > dán toàn bộ file > Run.
-- Mật khẩu mọi tài khoản: 123456. Chạy lại script sẽ đặt lại mật khẩu, kho
-- và vai trò theo đúng danh sách dưới đây.
-- ============================================================================

with test_users (full_name, email, role_code, phone, province, warehouse_code) as (
  values
    -- Khách hàng
    ('KH Gửi Hà Nội', 'kh.gui.hanoi@test.delivertrust.com', 'CUSTOMER', '0911000001', NULL, NULL),
    ('KH Nhận Đà Nẵng', 'kh.nhan.danang@test.delivertrust.com', 'CUSTOMER', '0911000002', NULL, NULL),
    ('KH Nhận Nha Trang', 'kh.nhan.nhatrang@test.delivertrust.com', 'CUSTOMER', '0911000003', NULL, NULL),
    ('KH Nhận TP.HCM', 'kh.nhan.hcm@test.delivertrust.com', 'CUSTOMER', '0911000004', NULL, NULL),

    -- Điều phối viên cấp tỉnh (điều phối toàn bộ kho phường trong tỉnh)
    ('ĐP Hà Nội', 'dp.hanoi@test.delivertrust.com', 'DISPATCHER', '0912000001', 'Thành phố Hà Nội', 'VN-PARENT-fb231348'),
    ('ĐP Đà Nẵng', 'dp.danang@test.delivertrust.com', 'DISPATCHER', '0912000002', 'Thành phố Đà Nẵng', 'VN-PARENT-324b7df4'),
    ('ĐP Khánh Hòa', 'dp.khanhhoa@test.delivertrust.com', 'DISPATCHER', '0912000003', 'Tỉnh Khánh Hòa', 'VN-PARENT-66c06ab7'),
    ('ĐP TP.HCM', 'dp.hcm@test.delivertrust.com', 'DISPATCHER', '0912000004', 'Thành phố Hồ Chí Minh', 'VN-PARENT-1ff7b4df'),

    -- Shipper thuộc kho phường
    ('Shipper Cầu Giấy', 'sp.hn.caugiay@test.delivertrust.com', 'DELIVERY_STAFF', '0913000001', 'Thành phố Hà Nội', 'VN-01-00166'),
    ('Shipper Hải Châu', 'sp.dn.haichau@test.delivertrust.com', 'DELIVERY_STAFF', '0913000002', 'Thành phố Đà Nẵng', 'VN-48-20242'),
    ('Shipper Nha Trang', 'sp.kh.nhatrang@test.delivertrust.com', 'DELIVERY_STAFF', '0913000003', 'Tỉnh Khánh Hòa', 'VN-56-22366'),
    ('Shipper Bến Thành', 'sp.hcm.benthanh@test.delivertrust.com', 'DELIVERY_STAFF', '0913000004', 'Thành phố Hồ Chí Minh', 'VN-79-26743'),

    -- Nhân viên kho: mỗi kho trên tuyến một tài khoản
    ('Kho Cầu Giấy', 'kho.hn.caugiay@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000001', 'Thành phố Hà Nội', 'VN-01-00166'),
    ('Kho tỉnh Hà Nội', 'kho.hn.tinh@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000002', 'Thành phố Hà Nội', 'VN-PARENT-fb231348'),
    ('Kho vùng Bắc Bộ', 'kho.vung.bac@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000003', 'Thành phố Hà Nội', 'VN-REG-NORTH'),
    ('Kho vùng miền Trung', 'kho.vung.trung@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000004', 'Thành phố Đà Nẵng', 'VN-REG-CENTRAL'),
    ('Kho tỉnh Đà Nẵng', 'kho.dn.tinh@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000005', 'Thành phố Đà Nẵng', 'VN-PARENT-324b7df4'),
    ('Kho Hải Châu', 'kho.dn.haichau@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000006', 'Thành phố Đà Nẵng', 'VN-48-20242'),
    ('Kho tỉnh Khánh Hòa', 'kho.kh.tinh@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000007', 'Tỉnh Khánh Hòa', 'VN-PARENT-66c06ab7'),
    ('Kho Nha Trang', 'kho.kh.nhatrang@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000008', 'Tỉnh Khánh Hòa', 'VN-56-22366'),
    ('Kho vùng Đông Nam Bộ', 'kho.vung.dnb@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000009', 'Thành phố Hồ Chí Minh', 'VN-REG-SOUTHEAST'),
    ('Kho tỉnh TP.HCM', 'kho.hcm.tinh@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000010', 'Thành phố Hồ Chí Minh', 'VN-PARENT-1ff7b4df'),
    ('Kho Bến Thành', 'kho.hcm.benthanh@test.delivertrust.com', 'WAREHOUSE_STAFF', '0914000011', 'Thành phố Hồ Chí Minh', 'VN-79-26743')
)
insert into public.users (full_name, email, password_hash, phone, province, warehouse_id, role_id, status)
select
  test.full_name,
  lower(test.email),
  crypt('123456', gen_salt('bf', 10)),
  test.phone,
  test.province,
  warehouse.id,
  role.id,
  'active'::public.user_status
from test_users as test
join public.roles as role on role.code = test.role_code
left join public.warehouses as warehouse on warehouse.code = test.warehouse_code
on conflict (email) do update
set
  full_name = excluded.full_name,
  password_hash = excluded.password_hash,
  phone = excluded.phone,
  province = excluded.province,
  warehouse_id = excluded.warehouse_id,
  role_id = excluded.role_id,
  status = 'active'::public.user_status,
  updated_at = now();

-- Kiểm tra: mọi tài khoản nhân viên phải có warehouse_code (không NULL).
select
  roles.code as role_code,
  users.full_name,
  users.email,
  users.phone,
  warehouses.code as warehouse_code,
  warehouses.warehouse_level
from public.users
join public.roles on roles.id = users.role_id
left join public.warehouses on warehouses.id = users.warehouse_id
where users.email like '%@test.delivertrust.com'
order by roles.code, users.email;
