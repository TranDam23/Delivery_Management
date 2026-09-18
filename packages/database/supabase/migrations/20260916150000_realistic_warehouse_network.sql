-- ============================================================================
-- Mang luoi kho dai dien theo mo hinh chuyen phat thuc te:
--   REGIONAL  = trung tam khai thac/phân loai cap vung
--   PROVINCE  = trung tam khai thac cap tinh/thanh pho
--   COMMUNE   = diem thu gom/phat khu vuc (khong dong nghia moi xa co mot kho
--               vat ly rieng; du lieu hien tai la cac diem phuc vu mau).
--
-- Migration nay khong xoa kho cu va khong xoa lich su don. Cac kho cu van
-- duoc giu de bao toan lien ket shipment_legs/warehouse_events; chi bo sung
-- tang trung tam vung, gan lai quan he cha-con va doi nhan hien thi.
-- ============================================================================

alter table public.warehouses
  drop constraint if exists warehouses_level_check,
  drop constraint if exists warehouses_hierarchy_check;

alter table public.warehouses
  add column if not exists region_code text;

alter table public.shipment_legs
  add column if not exists responsibility_province text;

-- VNPost cong bo mang luoi co cac trung tam khai thac/phat phan vung; du an
-- dung 6 hub dai dien de mo phong, khong phai danh sach dia chi noi bo cua
-- doanh nghiep.
insert into public.warehouses (
  code,
  name,
  address_line,
  ward,
  district,
  province,
  capacity,
  status,
  warehouse_level,
  parent_warehouse_id,
  region_code
)
values
  ('VN-REG-NORTH', 'Trung tâm khai thác vùng Bắc Bộ', 'Trung tâm khai thác vùng Bắc Bộ - Hà Nội', null, null, 'Thành phố Hà Nội', 25000, 'active', 'REGIONAL', null, 'NORTH'),
  ('VN-REG-NORTHEAST', 'Trung tâm khai thác vùng Đông Bắc', 'Trung tâm khai thác vùng Đông Bắc - Hải Phòng', null, null, 'Thành phố Hải Phòng', 22000, 'active', 'REGIONAL', null, 'NORTHEAST'),
  ('VN-REG-NORTHWEST', 'Trung tâm khai thác vùng Tây Bắc', 'Trung tâm khai thác vùng Tây Bắc - Phú Thọ', null, null, 'Tỉnh Phú Thọ', 18000, 'active', 'REGIONAL', null, 'NORTHWEST'),
  ('VN-REG-CENTRAL', 'Trung tâm khai thác vùng miền Trung', 'Trung tâm khai thác vùng miền Trung - Đà Nẵng', null, null, 'Thành phố Đà Nẵng', 24000, 'active', 'REGIONAL', null, 'CENTRAL'),
  ('VN-REG-SOUTHEAST', 'Trung tâm khai thác vùng Đông Nam Bộ', 'Trung tâm khai thác vùng Đông Nam Bộ - Thành phố Hồ Chí Minh', null, null, 'Thành phố Hồ Chí Minh', 30000, 'active', 'REGIONAL', null, 'SOUTHEAST'),
  ('VN-REG-SOUTHWEST', 'Trung tâm khai thác vùng Tây Nam Bộ', 'Trung tâm khai thác vùng Tây Nam Bộ - Cần Thơ', null, null, 'Thành phố Cần Thơ', 22000, 'active', 'REGIONAL', null, 'SOUTHWEST')
on conflict (code) do update
set
  name = excluded.name,
  address_line = excluded.address_line,
  province = excluded.province,
  capacity = excluded.capacity,
  status = excluded.status,
  warehouse_level = excluded.warehouse_level,
  parent_warehouse_id = null,
  region_code = excluded.region_code,
  updated_at = now();

-- Gan 34 don vi cap tinh hien hanh vao hub vung dai dien. Day la quy uoc
-- phan tuyen trong demo, co the thay doi khi doanh nghiep co bang phan vung
-- van hanh rieng.
with region_provinces(region_code, province) as (
  values
    ('NORTH', 'Thành phố Hà Nội'),
    ('NORTH', 'Tỉnh Hưng Yên'),
    ('NORTH', 'Tỉnh Ninh Bình'),
    ('NORTHEAST', 'Thành phố Hải Phòng'),
    ('NORTHEAST', 'Tỉnh Quảng Ninh'),
    ('NORTHEAST', 'Tỉnh Lạng Sơn'),
    ('NORTHEAST', 'Tỉnh Thái Nguyên'),
    ('NORTHEAST', 'Tỉnh Bắc Ninh'),
    ('NORTHWEST', 'Tỉnh Lào Cai'),
    ('NORTHWEST', 'Tỉnh Lai Châu'),
    ('NORTHWEST', 'Tỉnh Điện Biên'),
    ('NORTHWEST', 'Tỉnh Sơn La'),
    ('NORTHWEST', 'Tỉnh Tuyên Quang'),
    ('NORTHWEST', 'Tỉnh Cao Bằng'),
    ('NORTHWEST', 'Tỉnh Phú Thọ'),
    ('CENTRAL', 'Tỉnh Thanh Hóa'),
    ('CENTRAL', 'Tỉnh Nghệ An'),
    ('CENTRAL', 'Tỉnh Hà Tĩnh'),
    ('CENTRAL', 'Tỉnh Quảng Trị'),
    ('CENTRAL', 'Thành phố Huế'),
    ('CENTRAL', 'Thành phố Đà Nẵng'),
    ('CENTRAL', 'Tỉnh Quảng Ngãi'),
    ('CENTRAL', 'Tỉnh Gia Lai'),
    ('CENTRAL', 'Tỉnh Khánh Hòa'),
    ('CENTRAL', 'Tỉnh Đắk Lắk'),
    ('SOUTHEAST', 'Thành phố Hồ Chí Minh'),
    ('SOUTHEAST', 'Tỉnh Đồng Nai'),
    ('SOUTHEAST', 'Tỉnh Tây Ninh'),
    ('SOUTHEAST', 'Tỉnh Lâm Đồng'),
    ('SOUTHWEST', 'Thành phố Cần Thơ'),
    ('SOUTHWEST', 'Tỉnh An Giang'),
    ('SOUTHWEST', 'Tỉnh Đồng Tháp'),
    ('SOUTHWEST', 'Tỉnh Vĩnh Long'),
    ('SOUTHWEST', 'Tỉnh Cà Mau')
)
update public.warehouses as province_warehouse
set
  parent_warehouse_id = regional.id,
  region_code = mapping.region_code,
  name = case
    when province_warehouse.code like 'VN-PARENT-%'
      then 'Trung tâm khai thác cấp tỉnh - ' || province_warehouse.province
    else province_warehouse.name
  end,
  address_line = case
    when province_warehouse.code like 'VN-PARENT-%'
      then 'Trung tâm khai thác cấp tỉnh - ' || province_warehouse.province
    else province_warehouse.address_line
  end,
  updated_at = now()
from region_provinces as mapping
join public.warehouses as regional
  on regional.region_code = mapping.region_code
 and regional.warehouse_level = 'REGIONAL'
where province_warehouse.warehouse_level = 'PROVINCE'
  and province_warehouse.province = mapping.province;

-- Ke thua ma vung tu kho cha cho cac diem thu gom/phat khu vuc.
update public.warehouses as local_point
set region_code = province_warehouse.region_code,
    updated_at = now()
from public.warehouses as province_warehouse
where local_point.warehouse_level = 'COMMUNE'
  and local_point.parent_warehouse_id = province_warehouse.id
  and local_point.region_code is distinct from province_warehouse.region_code;

-- Bao dam cac chặng da tao truoc migration van co don vi chiu trach nhiem.
update public.shipment_legs as leg
set responsibility_province = warehouse.province
from public.warehouses as warehouse
where leg.responsibility_province is null
  and leg.leg_type = 'PICKUP'
  and leg.to_warehouse_id = warehouse.id;

update public.shipment_legs as leg
set responsibility_province = warehouse.province
from public.warehouses as warehouse
where leg.responsibility_province is null
  and leg.leg_type = 'LAST_MILE'
  and leg.from_warehouse_id = warehouse.id;

update public.shipment_legs as leg
set responsibility_province = warehouse.province
from public.warehouses as warehouse
where leg.responsibility_province is null
  and leg.leg_type = 'TRANSFER'
  and leg.from_warehouse_id = warehouse.id;

update public.shipment_legs as leg
set responsibility_province = warehouse.province
from public.warehouses as warehouse
where leg.responsibility_province is null
  and leg.to_warehouse_id = warehouse.id;

alter table public.warehouses
  add constraint warehouses_level_check
  check (warehouse_level in ('REGIONAL', 'PROVINCE', 'COMMUNE'));

alter table public.warehouses
  add constraint warehouses_hierarchy_check
  check (
    (warehouse_level = 'REGIONAL' and parent_warehouse_id is null)
    or
    (warehouse_level = 'PROVINCE' and parent_warehouse_id is not null)
    or
    (warehouse_level = 'COMMUNE' and parent_warehouse_id is not null)
  );

create index if not exists idx_warehouses_region_code
  on public.warehouses (region_code, warehouse_level, status);

create index if not exists idx_shipment_legs_responsibility_province
  on public.shipment_legs (responsibility_province, status, sequence_no);
