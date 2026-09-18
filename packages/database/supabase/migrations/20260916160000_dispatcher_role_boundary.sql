-- ============================================================================
-- Phan tach quyen dieu phoi khoi quyen tao don, quan ly kho va ghi nhan kho.
-- Dieu phoi vien chi lap tuyen, phan cong va giam sat trong pham vi tinh.
-- ============================================================================

insert into public.permissions (name, code, module, description)
values
  ('Xem danh muc kho', 'WAREHOUSE_VIEW', 'warehouses', 'Xem kho va diem thu gom/phat trong pham vi duoc cap'),
  ('Quan ly danh muc kho', 'WAREHOUSE_MANAGE', 'warehouses', 'Tao, cap nhat, kich hoat hoac tam dung kho'),
  ('Lap tuyen van chuyen', 'ROUTE_PLAN', 'shipments', 'Phan kho va chia don hang thanh cac chang van chuyen'),
  ('Ghi nhan nhap xuat kho', 'WAREHOUSE_SCAN', 'warehouses', 'Quet ma va ghi nhan moc nhap kho/xuat kho')
on conflict (code) do update
set name = excluded.name,
    module = excluded.module,
    description = excluded.description,
    updated_at = now();

-- Bao dam admin co cac quyen moi tren ca database da ton tai.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'ADMIN'
  and permission.code in ('WAREHOUSE_VIEW', 'WAREHOUSE_MANAGE', 'ROUTE_PLAN', 'WAREHOUSE_SCAN')
on conflict (role_id, permission_id) do nothing;

-- Dieu phoi vien chi duoc xem kho, lap tuyen va phan cong trong pham vi API.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'DISPATCHER'
  and permission.code in ('WAREHOUSE_VIEW', 'ROUTE_PLAN')
on conflict (role_id, permission_id) do nothing;

delete from public.role_permissions
where role_id = (select id from public.roles where code = 'DISPATCHER')
  and permission_id in (
    select id
    from public.permissions
    where code in ('ORDER_CREATE', 'ORDER_UPDATE', 'ORDER_CANCEL', 'COD_RECONCILE', 'WAREHOUSE_MANAGE', 'WAREHOUSE_SCAN')
  );

-- Nhan vien giao nhan la actor thuc hien cac moc nhap/xuat tren chặng duoc phan.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.code = 'DELIVERY_STAFF'
  and permission.code in ('WAREHOUSE_VIEW', 'WAREHOUSE_SCAN')
on conflict (role_id, permission_id) do nothing;

update public.roles
set description = 'Theo doi don theo pham vi, lap tuyen, phan cong va giam sat van hanh',
    updated_at = now()
where code = 'DISPATCHER';
