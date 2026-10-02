-- 1) Cảnh báo vận hành tự động (đơn trễ, kẹt trạng thái, luồng bất thường).
--    Mỗi đơn chỉ có tối đa một cảnh báo còn mở cho mỗi loại, để lần quét sau
--    không sinh thông báo trùng.
create unique index if not exists uq_alerts_open_per_order_type
  on public.alerts (order_id, alert_type)
  where status in ('open', 'acknowledged') and order_id is not null;

-- Thông báo cảnh báo gửi tới điều phối viên đúng phạm vi và tới mọi Quản trị viên;
-- loại cảnh báo trễ dùng type delivery_delayed, còn lại delivery_abnormal.
create or replace function public.notify_operational_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text := case when new.alert_type = 'DELIVERY_LATE' then 'delivery_delayed' else 'delivery_abnormal' end;
begin
  if new.order_id is null then return new; end if;
  insert into public.notifications (user_id, order_id, type, title, message)
  select distinct u.id, new.order_id, v_type, new.title, new.message
  from public.orders o
  join public.users u on u.status = 'active'
  join public.roles r on r.id = u.role_id and r.code = 'DISPATCHER'
  join public.warehouses assigned on assigned.id = u.warehouse_id
  join public.warehouses relevant on relevant.id in (o.pickup_warehouse_id, o.delivery_warehouse_id)
  where o.id = new.order_id
    and (assigned.id = relevant.id
      or (assigned.warehouse_level = 'PROVINCE'
        and lower(trim(assigned.province)) = lower(trim(relevant.province))));

  insert into public.notifications (user_id, order_id, type, title, message)
  select u.id, new.order_id, v_type, new.title, new.message
  from public.users u
  join public.roles r on r.id = u.role_id and r.code = 'ADMIN'
  where u.status = 'active';
  return new;
end;
$$;

insert into public.system_settings (key, value, description) values
  ('STUCK_STATUS_HOURS', '24', 'Đơn chưa kết thúc mà không có cập nhật nào quá số giờ này sẽ bị cảnh báo kẹt trạng thái'),
  ('ALERT_SCAN_INTERVAL_MINUTES', '10', 'Khoảng cách tối thiểu giữa hai lần quét cảnh báo tự động')
on conflict (key) do nothing;

-- 2) Nhật ký thao tác: tra cứu theo thời gian.
create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs (action);

-- 3) COD: sau đối soát, tiền còn phải được chuyển trả cho người gửi.
alter table public.cod_transactions
  add column if not exists remitted_at timestamptz,
  add column if not exists remitted_by uuid references public.users(id),
  add column if not exists remit_note text;

comment on column public.cod_transactions.remitted_at is 'Lúc đơn vị vận chuyển chuyển trả tiền COD cho người gửi (sau đối soát).';
