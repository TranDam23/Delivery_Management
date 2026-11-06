-- ============================================================================
-- Quan ly khu vuc hanh chinh (tinh/thanh pho -> quan/huyen -> phuong/xa).
-- Bang doc lap: khong thay doi warehouses, addresses hay luong don hang.
-- Ten khu vuc o cac bang khac van la text; API chan doi ten/xoa khi dang duoc dung.
-- ============================================================================

create table if not exists public.administrative_areas (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('PROVINCE', 'DISTRICT', 'WARD')),
  name text not null check (length(btrim(name)) between 1 and 120),
  parent_id uuid references public.administrative_areas (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint administrative_areas_parent_check check (
    (level = 'PROVINCE' and parent_id is null)
    or (level <> 'PROVINCE' and parent_id is not null)
  )
);

create unique index if not exists administrative_areas_unique_name
  on public.administrative_areas (level, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));
create index if not exists administrative_areas_parent_idx on public.administrative_areas (parent_id);

drop trigger if exists trg_administrative_areas_updated_at on public.administrative_areas;
create trigger trg_administrative_areas_updated_at
  before update on public.administrative_areas
  for each row execute function public.set_updated_at();

alter table public.administrative_areas enable row level security;

-- Seed tu du lieu da co (kho + dia chi khach hang).
with source as (
  select btrim(province) as province, nullif(btrim(district), '') as district, nullif(btrim(ward), '') as ward
  from public.warehouses where nullif(btrim(province), '') is not null
  union all
  select btrim(province), nullif(btrim(district), ''), nullif(btrim(ward), '')
  from public.addresses where nullif(btrim(province), '') is not null
)
insert into public.administrative_areas (level, name)
select distinct 'PROVINCE', province from source
on conflict do nothing;

with source as (
  select btrim(province) as province, nullif(btrim(district), '') as district
  from public.warehouses where nullif(btrim(province), '') is not null
  union all
  select btrim(province), nullif(btrim(district), '')
  from public.addresses where nullif(btrim(province), '') is not null
)
insert into public.administrative_areas (level, name, parent_id)
select distinct 'DISTRICT', source.district, province.id
from source
join public.administrative_areas province
  on province.level = 'PROVINCE' and lower(province.name) = lower(source.province)
where source.district is not null
on conflict do nothing;

with source as (
  select btrim(province) as province, nullif(btrim(district), '') as district, nullif(btrim(ward), '') as ward
  from public.warehouses where nullif(btrim(province), '') is not null
  union all
  select btrim(province), nullif(btrim(district), ''), nullif(btrim(ward), '')
  from public.addresses where nullif(btrim(province), '') is not null
)
insert into public.administrative_areas (level, name, parent_id)
select distinct 'WARD', source.ward, district.id
from source
join public.administrative_areas province
  on province.level = 'PROVINCE' and lower(province.name) = lower(source.province)
join public.administrative_areas district
  on district.level = 'DISTRICT' and district.parent_id = province.id and lower(district.name) = lower(source.district)
where source.ward is not null
on conflict do nothing;
