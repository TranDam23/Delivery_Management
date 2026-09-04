-- ============================================================================
-- Gop role tai khoan SENDER/RECEIVER thanh CUSTOMER.
--
-- SENDER/RECEIVER van duoc luu o contact_type de phan biet vi tri cua mot
-- lien he trong tung don hang. O cap tai khoan, khach hang dung mot giao dien
-- chung va co the vua tao don vua theo doi don nhan.
-- ============================================================================

insert into public.roles (name, code, description)
values (
  'Khach hang',
  'CUSTOMER',
  'Tao don, quan ly don gui va don nhan, tra cuu hanh trinh'
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

-- Cap cac quyen co ban cho khach hang.
insert into public.role_permissions (role_id, permission_id)
select customer.id, permission.id
from public.roles as customer
cross join public.permissions as permission
where customer.code = 'CUSTOMER'
  and permission.code in ('ORDER_VIEW', 'ORDER_CREATE', 'ORDER_CANCEL', 'BLOCKCHAIN_VERIFY')
on conflict (role_id, permission_id) do nothing;

-- Chuyen tai khoan cu sang role khach hang. Khong xoa hai role cu de cac
-- du lieu/foreign key cu van an toan; API se chuan hoa chung ve CUSTOMER.
update public.users as app_user
set
  role_id = customer.id,
  updated_at = now()
from public.roles as old_role
join public.roles as customer on customer.code = 'CUSTOMER'
where app_user.role_id = old_role.id
  and old_role.code in ('SENDER', 'RECEIVER');

-- Danh dau role cu khong con dung cho tai khoan moi.
update public.roles
set
  name = case code when 'SENDER' then 'Người gửi (cũ)' else 'Người nhận (cũ)' end,
  description = 'Role legacy, tai khoan moi dung CUSTOMER',
  updated_at = now()
where code in ('SENDER', 'RECEIVER');
