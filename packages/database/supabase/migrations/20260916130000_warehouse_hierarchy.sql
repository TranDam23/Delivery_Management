-- ============================================================================
-- Phan cap kho:
--   PROVINCE = kho cha cap tinh/thanh pho
--   COMMUNE  = kho con cap xa/phuong/dac khu
--
-- Cac kho con da duoc seed tu danh muc don vi hanh chinh cap xa. Migration nay
-- tao kho cha cho tung tinh/thanh pho va gan moi kho con vao dung kho cha.
-- ============================================================================

alter table public.warehouses
  add column if not exists warehouse_level text not null default 'COMMUNE',
  add column if not exists parent_warehouse_id uuid references public.warehouses(id) on delete set null;

-- Tao mot kho cha duy nhat cho moi tinh/thanh pho dang co trong database.
-- Ma kho dung hash de van on dinh voi ca cac kho duoc them thu cong sau nay.
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
  parent_warehouse_id
)
select
  'VN-PARENT-' || substr(md5(lower(trim(source.province))), 1, 8),
  'Kho cha ' || source.province,
  'Trung tam khai thac ' || source.province,
  null,
  null,
  source.province,
  null,
  'active',
  'PROVINCE',
  null
from (
  select distinct province
  from public.warehouses
  where province is not null and trim(province) <> ''
) as source
on conflict (code) do update
set
  name = excluded.name,
  province = excluded.province,
  warehouse_level = 'PROVINCE',
  parent_warehouse_id = null,
  updated_at = now();

-- Moi kho cap xa/phuong phai tro ve kho cha cung tinh/thanh pho.
update public.warehouses as child
set parent_warehouse_id = parent.id
from public.warehouses as parent
where child.warehouse_level = 'COMMUNE'
  and parent.warehouse_level = 'PROVINCE'
  and lower(trim(parent.province)) = lower(trim(child.province));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'warehouses_level_check'
  ) then
    alter table public.warehouses
      add constraint warehouses_level_check
      check (warehouse_level in ('PROVINCE', 'COMMUNE'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'warehouses_hierarchy_check'
  ) then
    alter table public.warehouses
      add constraint warehouses_hierarchy_check
      check (
        (warehouse_level = 'PROVINCE' and parent_warehouse_id is null)
        or
        (warehouse_level = 'COMMUNE' and parent_warehouse_id is not null)
      );
  end if;
end $$;

create index if not exists idx_warehouses_level_province
  on public.warehouses (warehouse_level, province, status);
create index if not exists idx_warehouses_parent_id
  on public.warehouses (parent_warehouse_id);
