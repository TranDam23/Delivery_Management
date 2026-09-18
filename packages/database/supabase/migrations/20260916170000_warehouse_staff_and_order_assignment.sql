-- ============================================================================
-- Gan tai khoan vao kho van hanh va luu ket qua phan kho ngay khi tao don.
-- Dieu phoi vien phu trach mot kho; nhan vien kho ghi nhan nhap/xuat tai kho
-- duoc cap. Cac cot nullable de khong lam mat du lieu don cu.
-- ============================================================================

alter table public.users
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete set null;

create index if not exists idx_users_warehouse_id on public.users (warehouse_id);

alter table public.orders
  add column if not exists pickup_warehouse_id uuid references public.warehouses(id) on delete set null,
  add column if not exists delivery_warehouse_id uuid references public.warehouses(id) on delete set null;

create index if not exists idx_orders_pickup_warehouse_id on public.orders (pickup_warehouse_id);
create index if not exists idx_orders_delivery_warehouse_id on public.orders (delivery_warehouse_id);

insert into public.roles (name, code, description)
values (
  'Nhan vien kho',
  'WAREHOUSE_STAFF',
  'Xac nhan nhap xuat kho va ban giao hang hoa tai kho duoc phan cong'
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'WAREHOUSE_STAFF'
  and permission.code in ('ORDER_VIEW', 'WAREHOUSE_VIEW', 'WAREHOUSE_SCAN')
on conflict (role_id, permission_id) do nothing;

-- Tu day, shipper chi nhan hang/giao hang; nhan vien kho moi xac nhan
-- cac moc nhap/xuat de tranh mot nguoi dung hai nghiep vu khac nhau.
delete from public.role_permissions
where role_id = (select id from public.roles where code = 'DELIVERY_STAFF')
  and permission_id in (
    select id from public.permissions where code in ('WAREHOUSE_VIEW', 'WAREHOUSE_SCAN')
  );

-- Gan tai khoan demo hien co vao diem van hanh mau o Ha Noi de co the test
-- ngay sau khi chay migration. Admin co the doi lai kho cho tai khoan that.
update public.users as user_row
set warehouse_id = warehouse.id,
    updated_at = now()
from public.roles as role,
     public.warehouses as warehouse
where user_row.role_id = role.id
  and role.code in ('DISPATCHER', 'DELIVERY_STAFF')
  and user_row.warehouse_id is null
  and user_row.province = 'Thành phố Hà Nội'
  and warehouse.code = 'VN-01-00166';
