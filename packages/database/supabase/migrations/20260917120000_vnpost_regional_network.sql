-- ============================================================================
-- Quy hoạch trung tâm vùng theo mô hình 3 vùng khai thác đại diện:
--   Miền Bắc  -> VN-REG-NORTH
--   Miền Trung -> VN-REG-CENTRAL (Đà Nẵng)
--   Miền Nam  -> VN-REG-SOUTHEAST (Thành phố Hồ Chí Minh)
--
-- Vietnam Post công bố các trung tâm khai thác vùng đặt tại Hà Nội, Đà Nẵng
-- và Thành phố Hồ Chí Minh. Các hub phụ đã được tạo ở migration trước vẫn
-- được giữ lại để không làm mất lịch sử, nhưng các kho tỉnh mới sẽ đi qua
-- một trong ba trung tâm chính này.
-- ============================================================================

with region_provinces(region_code, province) as (
  values
    -- Miền Bắc
    ('NORTH', 'Thành phố Hà Nội'),
    ('NORTH', 'Tỉnh Hưng Yên'),
    ('NORTH', 'Tỉnh Ninh Bình'),
    ('NORTH', 'Thành phố Hải Phòng'),
    ('NORTH', 'Tỉnh Quảng Ninh'),
    ('NORTH', 'Tỉnh Lạng Sơn'),
    ('NORTH', 'Tỉnh Thái Nguyên'),
    ('NORTH', 'Tỉnh Bắc Ninh'),
    ('NORTH', 'Tỉnh Lào Cai'),
    ('NORTH', 'Tỉnh Lai Châu'),
    ('NORTH', 'Tỉnh Điện Biên'),
    ('NORTH', 'Tỉnh Sơn La'),
    ('NORTH', 'Tỉnh Tuyên Quang'),
    ('NORTH', 'Tỉnh Cao Bằng'),
    ('NORTH', 'Tỉnh Phú Thọ'),
    -- Miền Trung và Tây Nguyên
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
    ('CENTRAL', 'Tỉnh Lâm Đồng'),
    -- Miền Nam
    ('SOUTHEAST', 'Thành phố Hồ Chí Minh'),
    ('SOUTHEAST', 'Tỉnh Đồng Nai'),
    ('SOUTHEAST', 'Tỉnh Tây Ninh'),
    ('SOUTHEAST', 'Thành phố Cần Thơ'),
    ('SOUTHEAST', 'Tỉnh An Giang'),
    ('SOUTHEAST', 'Tỉnh Đồng Tháp'),
    ('SOUTHEAST', 'Tỉnh Vĩnh Long'),
    ('SOUTHEAST', 'Tỉnh Cà Mau')
)
update public.warehouses as province_warehouse
set
  parent_warehouse_id = regional.id,
  region_code = mapping.region_code,
  updated_at = now()
from region_provinces as mapping
join public.warehouses as regional
  on regional.code = case mapping.region_code
    when 'NORTH' then 'VN-REG-NORTH'
    when 'CENTRAL' then 'VN-REG-CENTRAL'
    when 'SOUTHEAST' then 'VN-REG-SOUTHEAST'
  end
  and regional.warehouse_level = 'REGIONAL'
  and regional.status = 'active'
where province_warehouse.warehouse_level = 'PROVINCE'
  and province_warehouse.province = mapping.province;

update public.warehouses as local_point
set
  region_code = province_warehouse.region_code,
  updated_at = now()
from public.warehouses as province_warehouse
where local_point.warehouse_level = 'COMMUNE'
  and local_point.parent_warehouse_id = province_warehouse.id
  and local_point.region_code is distinct from province_warehouse.region_code;

create index if not exists idx_warehouses_active_route_lookup
  on public.warehouses (status, warehouse_level, province, district, ward, region_code);
