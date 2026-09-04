-- ============================================================================
-- Seed du lieu tham chieu: roles, permissions, order_statuses
-- ============================================================================

insert into roles (name, code, description) values
  ('Quan tri vien', 'ADMIN', 'Toan quyen quan ly he thong'),
  ('Dieu phoi vien', 'DISPATCHER', 'Tao don, phan cong nhan vien giao hang, doi soat COD'),
  ('Nhan vien giao hang', 'DELIVERY_STAFF', 'Quet QR, cap nhat trang thai giao nhan'),
  ('Khach hang', 'CUSTOMER', 'Tao don, quan ly don gui va don nhan, tra cuu hanh trinh');

insert into permissions (name, code, module, description) values
  ('Xem don hang', 'ORDER_VIEW', 'orders', 'Xem danh sach va chi tiet don hang'),
  ('Tao don hang', 'ORDER_CREATE', 'orders', 'Tao moi don giao hang'),
  ('Cap nhat don hang', 'ORDER_UPDATE', 'orders', 'Chinh sua thong tin don hang'),
  ('Huy don hang', 'ORDER_CANCEL', 'orders', 'Huy don hang'),
  ('Phan cong giao hang', 'DELIVERY_ASSIGN', 'deliveries', 'Phan cong nhan vien giao hang cho don'),
  ('Cap nhat trang thai giao hang', 'DELIVERY_UPDATE_STATUS', 'deliveries', 'Quet QR, cap nhat trang thai van chuyen'),
  ('Quan ly nguoi dung', 'USER_MANAGE', 'users', 'Tao/sua/khoa tai khoan nguoi dung'),
  ('Doi soat COD', 'COD_RECONCILE', 'cod', 'Doi soat tien thu ho COD'),
  ('Xem bao cao thong ke', 'REPORT_VIEW', 'reports', 'Xem thong ke, bao cao van hanh'),
  ('Xac minh Blockchain', 'BLOCKCHAIN_VERIFY', 'blockchain', 'Tra cuu, xac minh du lieu tren blockchain');

-- ADMIN: full quyen
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p where r.code = 'ADMIN';

-- DISPATCHER
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
where r.code = 'DISPATCHER'
  and p.code in ('ORDER_VIEW', 'ORDER_CREATE', 'ORDER_UPDATE', 'ORDER_CANCEL', 'DELIVERY_ASSIGN', 'COD_RECONCILE', 'REPORT_VIEW', 'BLOCKCHAIN_VERIFY');

-- DELIVERY_STAFF
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
where r.code = 'DELIVERY_STAFF'
  and p.code in ('ORDER_VIEW', 'DELIVERY_UPDATE_STATUS', 'BLOCKCHAIN_VERIFY');

-- CUSTOMER: cung mot tai khoan cho ca luong gui va nhan
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
where r.code = 'CUSTOMER'
  and p.code in ('ORDER_VIEW', 'ORDER_CREATE', 'ORDER_CANCEL', 'BLOCKCHAIN_VERIFY');

insert into order_statuses (code, name, description, is_final) values
  ('CREATED', 'Da tao don', 'Don hang vua duoc tao, cho lay hang', false),
  ('PICKED_UP', 'Da lay hang', 'Nhan vien da nhan hang tu nguoi gui', false),
  ('IN_WAREHOUSE', 'Tai kho', 'Hang dang o kho trung chuyen', false),
  ('IN_TRANSIT', 'Dang van chuyen', 'Hang dang tren duong van chuyen giua cac kho', false),
  ('DELIVERING', 'Dang giao hang', 'Nhan vien dang giao hang cho nguoi nhan', false),
  ('DELIVERED', 'Giao thanh cong', 'Don hang da giao thanh cong', true),
  ('DELIVERY_FAILED', 'Giao that bai', 'Giao hang khong thanh cong, se thu lai hoac hoan hang', false),
  ('RETURNING', 'Dang hoan hang', 'Hang dang duoc hoan tra ve nguoi gui', false),
  ('RETURNED', 'Da hoan hang', 'Hang da hoan tra thanh cong ve nguoi gui', true),
  ('CANCELLED', 'Da huy', 'Don hang da bi huy', true);

insert into system_settings (key, value, description) values
  ('MAX_DELIVERY_ATTEMPTS', '3', 'So lan giao hang toi da truoc khi tu dong chuyen hoan hang'),
  ('DELIVERY_SLA_HOURS', '48', 'So gio toi da tu luc tao don den luc giao thanh cong truoc khi coi la tre han'),
  ('BLOCKCHAIN_CONTRACT_ADDRESS', '', 'Dia chi smart contract DeliveryTracking dang su dung');
