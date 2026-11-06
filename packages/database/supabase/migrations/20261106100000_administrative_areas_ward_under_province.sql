-- Du lieu thuc te dung mo hinh 2 cap (tinh -> phuong/xa), khong co quan/huyen.
-- Cho phep phuong/xa nam truc tiep duoi tinh (district la tuy chon) va bo sung seed.

with source as (
  select btrim(province) as province, nullif(btrim(ward), '') as ward
  from public.warehouses
  where nullif(btrim(province), '') is not null and nullif(btrim(district), '') is null
  union all
  select btrim(province), nullif(btrim(ward), '')
  from public.addresses
  where nullif(btrim(province), '') is not null and nullif(btrim(district), '') is null
)
insert into public.administrative_areas (level, name, parent_id)
select distinct 'WARD', source.ward, province.id
from source
join public.administrative_areas province
  on province.level = 'PROVINCE' and lower(province.name) = lower(source.province)
where source.ward is not null
on conflict do nothing;
