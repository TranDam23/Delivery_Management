-- ============================================================================
-- Bang gia cuoc van chuyen cau hinh duoc (thay cho hang so trong code):
--   - shipping_tariffs: cuoc co ban + phu phi moi bac can nang theo dich vu x pham vi tuyen
--   - shipping_area_surcharges: phu phi theo khu vuc (tinh, hoac phuong/xa vung xa)
--   - system_settings: buoc can nang, he so quy doi the tich, nguong kien cong kenh
-- Gia tri khoi tao trung voi bieu phi demo cu nen cuoc khong doi cho den khi Admin chinh sua.
-- ============================================================================

create table if not exists public.shipping_tariffs (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (service_type in ('standard', 'express', 'same_day')),
  zone text not null check (zone in ('same_province', 'same_region', 'inter_region')),
  base_fee numeric(12, 0) not null check (base_fee >= 0),
  step_fee numeric(12, 0) not null check (step_fee >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_type, zone)
);

create table if not exists public.shipping_area_surcharges (
  id uuid primary key default gen_random_uuid(),
  province text not null check (length(btrim(province)) > 0),
  ward text,
  apply_to text not null default 'DELIVERY' check (apply_to in ('DELIVERY', 'PICKUP')),
  surcharge_fee numeric(12, 0) not null check (surcharge_fee >= 0),
  note text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shipping_area_surcharges_unique
  on public.shipping_area_surcharges (lower(btrim(province)), lower(btrim(coalesce(ward, ''))), apply_to);

drop trigger if exists trg_shipping_tariffs_updated_at on public.shipping_tariffs;
create trigger trg_shipping_tariffs_updated_at
  before update on public.shipping_tariffs
  for each row execute function public.set_updated_at();
drop trigger if exists trg_shipping_area_surcharges_updated_at on public.shipping_area_surcharges;
create trigger trg_shipping_area_surcharges_updated_at
  before update on public.shipping_area_surcharges
  for each row execute function public.set_updated_at();

alter table public.shipping_tariffs enable row level security;
alter table public.shipping_area_surcharges enable row level security;

insert into public.shipping_tariffs (service_type, zone, base_fee, step_fee) values
  ('standard', 'same_province', 20000, 2500),
  ('standard', 'same_region', 28000, 4000),
  ('standard', 'inter_region', 38000, 5500),
  ('express', 'same_province', 35000, 4000),
  ('express', 'same_region', 45000, 6000),
  ('express', 'inter_region', 60000, 8500),
  ('same_day', 'same_province', 55000, 5000)
on conflict (service_type, zone) do nothing;

insert into public.system_settings (key, value, description) values
  ('SHIPPING_WEIGHT_STEP_KG', '0.5', 'Buoc can nang tinh cuoc (kg)'),
  ('SHIPPING_VOLUMETRIC_DIVISOR', '6000', 'He so quy doi the tich: dai x rong x cao (cm3) / he so = kg'),
  ('SHIPPING_OVERSIZE_SIDE_CM', '100', 'Canh dai nhat (cm) tu muc nay tro len bi tinh phu phi kien cong kenh'),
  ('SHIPPING_OVERSIZE_FEE', '30000', 'Phu phi kien cong kenh (dong, tinh mot lan cho moi don)')
on conflict (key) do nothing;
