-- ============================================================================
-- Tai khoan mau de kiem thu 3 tuyen lien tinh:
--   Ha Noi -> Thanh pho Ho Chi Minh
--   Ha Noi -> Gia Lai
--   Ha Noi -> Da Nang
--
-- Chay sau khi da chay cac migration kho va demo_users.sql.
-- Mat khau tat ca tai khoan: 123456
-- ============================================================================

with demo_users (full_name, email, role_code, phone, province, warehouse_code, warehouse_level) as (
  values
    ('Điều phối viên Hà Nội', 'dispatcher.hanoi@delivertrust.com', 'DISPATCHER', '0900000100', 'Thành phố Hà Nội', null, 'PROVINCE'),
    ('Điều phối viên Hồ Chí Minh', 'dispatcher.hcm@delivertrust.com', 'DISPATCHER', '0900000101', 'Thành phố Hồ Chí Minh', null, 'PROVINCE'),
    ('Điều phối viên Gia Lai', 'dispatcher.gialai@delivertrust.com', 'DISPATCHER', '0900000102', 'Tỉnh Gia Lai', null, 'PROVINCE'),
    ('Điều phối viên Đà Nẵng', 'dispatcher.danang@delivertrust.com', 'DISPATCHER', '0900000103', 'Thành phố Đà Nẵng', null, 'PROVINCE'),
    ('Nhân viên kho Hà Nội', 'warehouse.hanoi@delivertrust.com', 'WAREHOUSE_STAFF', '0900000111', 'Thành phố Hà Nội', null, 'PROVINCE'),
    ('Nhân viên kho Hồ Chí Minh', 'warehouse.hcm@delivertrust.com', 'WAREHOUSE_STAFF', '0900000112', 'Thành phố Hồ Chí Minh', null, 'PROVINCE'),
    ('Nhân viên kho Gia Lai', 'warehouse.gialai@delivertrust.com', 'WAREHOUSE_STAFF', '0900000113', 'Tỉnh Gia Lai', null, 'PROVINCE'),
    ('Nhân viên kho Đà Nẵng', 'warehouse.danang@delivertrust.com', 'WAREHOUSE_STAFF', '0900000114', 'Thành phố Đà Nẵng', null, 'PROVINCE'),
    ('Nhân viên trung tâm miền Bắc', 'warehouse.north@delivertrust.com', 'WAREHOUSE_STAFF', '0900000121', 'Thành phố Hà Nội', 'VN-REG-NORTH', 'REGIONAL'),
    ('Nhân viên trung tâm miền Trung', 'warehouse.central@delivertrust.com', 'WAREHOUSE_STAFF', '0900000122', 'Thành phố Đà Nẵng', 'VN-REG-CENTRAL', 'REGIONAL'),
    ('Nhân viên trung tâm miền Nam', 'warehouse.southeast@delivertrust.com', 'WAREHOUSE_STAFF', '0900000123', 'Thành phố Hồ Chí Minh', 'VN-REG-SOUTHEAST', 'REGIONAL'),
    ('Shipper Hồ Chí Minh', 'delivery.hcm@delivertrust.com', 'DELIVERY_STAFF', '0900000131', 'Thành phố Hồ Chí Minh', 'VN-79-25747', 'COMMUNE'),
    ('Shipper Gia Lai', 'delivery.gialai@delivertrust.com', 'DELIVERY_STAFF', '0900000132', 'Tỉnh Gia Lai', 'VN-52-23575', 'COMMUNE'),
    ('Shipper Đà Nẵng', 'delivery.danang@delivertrust.com', 'DELIVERY_STAFF', '0900000133', 'Thành phố Đà Nẵng', 'VN-48-20242', 'COMMUNE')
),
resolved_users as (
  select
    demo.*,
    warehouse.id as warehouse_id
  from demo_users as demo
  left join lateral (
    select w.id
    from public.warehouses as w
    where w.status = 'active'
      and (
        (demo.warehouse_code is not null and w.code = demo.warehouse_code)
        or (
          demo.warehouse_code is null
          and w.warehouse_level = demo.warehouse_level
          and w.province = demo.province
        )
      )
    order by w.code
    limit 1
  ) as warehouse on true
)
insert into public.users (full_name, email, password_hash, phone, province, warehouse_id, role_id, status)
select
  demo.full_name,
  lower(demo.email),
  crypt('123456', gen_salt('bf', 10)),
  demo.phone,
  demo.province,
  demo.warehouse_id,
  role.id,
  'active'::public.user_status
from resolved_users as demo
join public.roles as role on role.code = demo.role_code
where demo.warehouse_id is not null
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

select
  users.full_name,
  users.email,
  roles.code as role_code,
  users.province,
  warehouses.code as warehouse_code,
  warehouses.name as warehouse_name,
  users.status
from public.users
join public.roles on roles.id = users.role_id
left join public.warehouses on warehouses.id = users.warehouse_id
where users.email like any (array[
  'dispatcher.%@delivertrust.com',
  'warehouse.%@delivertrust.com',
  'delivery.%@delivertrust.com'
])
order by users.email;
