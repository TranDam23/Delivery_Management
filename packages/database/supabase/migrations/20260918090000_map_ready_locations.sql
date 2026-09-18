-- ============================================================================
-- Chuẩn bị dữ liệu vị trí cho bản đồ theo dõi đơn (kiểu Shopee/TikTok Shop):
-- 1) Địa chỉ khách hàng lưu tọa độ ghim, place_id và nguồn tọa độ.
-- 2) Kho có tọa độ để vẽ tuyến và chọn kho gần nhất theo khoảng cách.
-- 3) Vị trí shipper theo thời gian khi đang thực hiện chặng.
-- Toàn bộ cột mới đều nullable: dữ liệu cũ vẫn hợp lệ, bản đồ chỉ hiển thị
-- điểm nào đã có tọa độ.
-- ============================================================================

-- 1) Địa chỉ khách hàng. latitude/longitude đã có từ schema ban đầu.
alter table addresses
  add column if not exists place_id text,
  add column if not exists formatted_address text,
  add column if not exists location_source text,
  add column if not exists geocoded_at timestamptz;

alter table addresses drop constraint if exists addresses_coordinates_check;
alter table addresses
  add constraint addresses_coordinates_check check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  );

alter table addresses drop constraint if exists addresses_location_source_check;
alter table addresses
  add constraint addresses_location_source_check check (
    location_source is null or location_source in ('MAP_PIN', 'PLACES', 'GEOCODED', 'DEVICE_GPS')
  );

-- 2) Kho.
alter table warehouses
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists place_id text,
  add column if not exists geocoded_at timestamptz;

alter table warehouses drop constraint if exists warehouses_coordinates_check;
alter table warehouses
  add constraint warehouses_coordinates_check check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  );

create index if not exists idx_warehouses_has_coordinates
  on warehouses (warehouse_level, province)
  where latitude is not null;

-- 3) Vị trí shipper. Chỉ ghi khi đang thực hiện chặng để không theo dõi
-- nhân viên ngoài giờ làm; người gửi/nhận chỉ đọc được qua API bản đồ.
create table if not exists courier_locations (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references users (id) on delete cascade,
  shipment_leg_id uuid not null references shipment_legs (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  heading_deg double precision,
  speed_mps double precision,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint courier_locations_coordinates_check
    check (latitude between -90 and 90 and longitude between -180 and 180),
  constraint courier_locations_accuracy_check check (accuracy_m is null or accuracy_m >= 0),
  constraint courier_locations_heading_check check (heading_deg is null or (heading_deg >= 0 and heading_deg < 360)),
  constraint courier_locations_speed_check check (speed_mps is null or speed_mps >= 0)
);

create index if not exists idx_courier_locations_leg_time
  on courier_locations (shipment_leg_id, recorded_at desc);
create index if not exists idx_courier_locations_order_time
  on courier_locations (order_id, recorded_at desc);
create index if not exists idx_courier_locations_courier_time
  on courier_locations (courier_id, recorded_at desc);

alter table courier_locations enable row level security;
