-- ============================================================================
-- Du lieu mau de test dang nhap theo role
--
-- Day la script thao tac thu cong, khong phai migration.
-- Cach dung:
--   1. Thay cac gia tri password_plain bang mat khau ban muon dung.
--   2. Mo Supabase Dashboard > SQL Editor.
--   3. Paste toan bo file nay va bam Run.
--
-- Mat khau chi ton tai tam thoi trong cau lenh SQL; cot password_hash luu
-- bcrypt hash nhờ pgcrypto, phu hop voi bcryptjs trong API dang nhap.
-- Neu chay lai script, password_hash cua cac email mau se duoc cap nhat lai
-- theo gia tri password_plain hien tai.
-- ============================================================================

with demo_users (full_name, email, role_code, password_plain, phone, province, warehouse_code) as (
  values
    ('Admin Demo', 'admin.demo@delivertrust.com', 'ADMIN', '123456', '0900000001', NULL, NULL),
    ('Dispatcher Demo', 'dispatcher.demo@delivertrust.com', 'DISPATCHER', '123456', '0900000002', 'Thành phố Hà Nội', 'VN-01-00166'),
    ('Delivery Demo', 'delivery.demo@delivertrust.com', 'DELIVERY_STAFF', '123456', '0900000003', 'Thành phố Hà Nội', 'VN-01-00166'),
    ('Warehouse Staff Demo', 'warehouse.staff.demo@delivertrust.com', 'WAREHOUSE_STAFF', '123456', '0900000006', 'Thành phố Hà Nội', 'VN-01-00166'),
    ('Customer Demo 1', 'sender.demo@delivertrust.com', 'CUSTOMER', '123456', '0900000004', NULL, NULL),
    ('Customer Demo 2', 'receiver.demo@delivertrust.com', 'CUSTOMER', '123456', '0900000005', NULL, NULL)
)
insert into public.users (full_name, email, password_hash, phone, province, warehouse_id, role_id, status)
select
  demo.full_name,
  lower(demo.email),
  crypt(demo.password_plain, gen_salt('bf', 10)),
  demo.phone,
  demo.province,
  warehouse.id,
  role.id,
  'active'::public.user_status
from demo_users as demo
join public.roles as role on role.code = demo.role_code
left join public.warehouses as warehouse on warehouse.code = demo.warehouse_code
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

-- Kiem tra email va role sau khi insert.
select
  users.full_name,
  users.email,
  roles.code as role_code,
  users.province,
  warehouses.code as warehouse_code,
  users.status
from public.users
join public.roles on roles.id = users.role_id
left join public.warehouses on warehouses.id = users.warehouse_id
where users.email in (
  'admin.demo@delivertrust.com',
  'dispatcher.demo@delivertrust.com',
  'delivery.demo@delivertrust.com',
  'warehouse.staff.demo@delivertrust.com',
  'sender.demo@delivertrust.com',
  'receiver.demo@delivertrust.com'
)
order by roles.code;
