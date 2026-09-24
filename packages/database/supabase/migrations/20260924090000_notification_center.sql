-- In-app notifications are created by the same database writes that change an
-- order/assignment, so callers cannot forget to send them. Existing rows are
-- deliberately not backfilled: a historical event is not a new notification.
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc, id desc);
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where is_read = false;

-- A contact belongs to the address-book owner, not necessarily the person in
-- the contact. Resolve customers by their account phone; the creator receives
-- sender-side updates only when that account is itself a customer.
create or replace function public.notify_order_customers(
  p_order_id uuid, p_title text, p_message text, p_type text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, order_id, type, title, message)
  select distinct u.id, p_order_id, p_type, p_title, p_message
  from public.orders o
  join public.users u on u.status = 'active'
  join public.roles r on r.id = u.role_id and r.code = 'CUSTOMER'
  left join public.contacts sender on sender.id = o.sender_id
  left join public.contacts receiver on receiver.id = o.receiver_id
  where o.id = p_order_id
    and (
      u.id = o.created_by
      or (
        length(regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g')) >= 9
        and right(regexp_replace(u.phone, '[^0-9]', '', 'g'), 9) in (
          right(regexp_replace(coalesce(sender.phone, ''), '[^0-9]', '', 'g'), 9),
          right(regexp_replace(coalesce(receiver.phone, ''), '[^0-9]', '', 'g'), 9)
        )
      )
    );
end;
$$;
revoke all on function public.notify_order_customers(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.notify_order_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  status_row record;
begin
  if tg_op = 'UPDATE' then
    if old.status_id is not distinct from new.status_id then return new; end if;
  end if;
  select code, name into status_row from public.order_statuses where id = new.status_id;
  if status_row.code is null then return new; end if;

  perform public.notify_order_customers(
    new.id,
    case when tg_op = 'INSERT' then 'Đơn hàng đã được tạo'
         when status_row.code = 'DELIVERED' then 'Giao hàng thành công'
         when status_row.code in ('DELIVERY_FAILED', 'RETURNING', 'RETURNED') then 'Đơn hàng cần chú ý'
         else 'Trạng thái đơn hàng thay đổi' end,
    'Đơn ' || new.tracking_code || ': ' || status_row.name || '.',
    case when status_row.code = 'DELIVERED' then 'delivery_success'
         when status_row.code in ('DELIVERY_FAILED', 'RETURNING', 'RETURNED') then 'delivery_abnormal'
         else 'order_status_changed' end
  );

  if tg_op = 'INSERT' and new.pickup_warehouse_id is not null then
    insert into public.notifications (user_id, order_id, type, title, message)
    select u.id, new.id, 'system', 'Đơn mới cần điều phối',
           'Đơn ' || new.tracking_code || ' đã được phân về kho của bạn để phân công lấy hàng.'
    from public.users u
    join public.roles r on r.id = u.role_id and r.code = 'DISPATCHER'
    where u.status = 'active' and u.warehouse_id = new.pickup_warehouse_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notify_order_change on public.orders;
create trigger trg_notify_order_change
  after insert or update of status_id on public.orders
  for each row execute function public.notify_order_change();

create or replace function public.notify_leg_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  tracking text;
  task_name text;
begin
  if new.assigned_staff_id is null or new.status <> 'ASSIGNED' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.assigned_staff_id is not distinct from new.assigned_staff_id
       and old.attempt_no is not distinct from new.attempt_no
       and old.status is not distinct from new.status then return new; end if;
  end if;
  select tracking_code into tracking from public.orders where id = new.order_id;
  task_name := case new.leg_type when 'PICKUP' then 'lấy hàng'
              when 'LAST_MILE' then 'giao hàng' else 'vận chuyển' end;
  insert into public.notifications (user_id, order_id, type, title, message)
  values (new.assigned_staff_id, new.order_id, 'system', 'Nhiệm vụ mới',
          'Bạn được phân công ' || task_name || ' cho đơn ' || tracking || '.');
  return new;
end;
$$;
drop trigger if exists trg_notify_leg_assignment on public.shipment_legs;
create trigger trg_notify_leg_assignment
  after insert or update of assigned_staff_id, status, attempt_no on public.shipment_legs
  for each row execute function public.notify_leg_assignment();

create or replace function public.notify_warehouse_outbound()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  destination_id uuid;
  tracking text;
begin
  if new.event_type <> 'OUTBOUND' then return new; end if;
  select to_warehouse_id into destination_id from public.shipment_legs where id = new.shipment_leg_id;
  if destination_id is null or destination_id = new.warehouse_id then return new; end if;
  select tracking_code into tracking from public.orders where id = new.order_id;
  insert into public.notifications (user_id, order_id, type, title, message)
  select u.id, new.order_id, 'system', 'Hàng đang đến kho',
         'Đơn ' || tracking || ' đã xuất kho; chuẩn bị xác nhận khi hàng đến.'
  from public.users u
  join public.roles r on r.id = u.role_id and r.code in ('WAREHOUSE_STAFF', 'DISPATCHER')
  where u.status = 'active' and u.warehouse_id = destination_id;
  return new;
end;
$$;
drop trigger if exists trg_notify_warehouse_outbound on public.warehouse_events;
create trigger trg_notify_warehouse_outbound
  after insert on public.warehouse_events
  for each row execute function public.notify_warehouse_outbound();

create or replace function public.notify_operational_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pickup_id uuid;
  delivery_id uuid;
begin
  if new.order_id is null then return new; end if;
  select pickup_warehouse_id, delivery_warehouse_id into pickup_id, delivery_id
    from public.orders where id = new.order_id;
  insert into public.notifications (user_id, order_id, type, title, message)
  select distinct u.id, new.order_id, 'delivery_abnormal', new.title, new.message
  from public.users u
  join public.roles r on r.id = u.role_id and r.code = 'DISPATCHER'
  where u.status = 'active' and u.warehouse_id in (pickup_id, delivery_id);
  return new;
end;
$$;
drop trigger if exists trg_notify_operational_alert on public.alerts;
create trigger trg_notify_operational_alert
  after insert on public.alerts
  for each row execute function public.notify_operational_alert();

create or replace function public.notify_receipt_confirmation()
returns trigger language plpgsql security definer set search_path = public as $$
declare tracking text;
begin
  if new.received_at is null or old.received_at is not null or new.is_return then return new; end if;
  select tracking_code into tracking from public.orders where id = new.order_id;
  perform public.notify_order_customers(new.order_id, 'Người nhận đã xác nhận',
    'Đơn ' || tracking || ' đã được người nhận xác nhận đã nhận hàng.', 'delivery_success');
  return new;
end;
$$;
drop trigger if exists trg_notify_receipt_confirmation on public.deliveries;
create trigger trg_notify_receipt_confirmation
  after update of received_at on public.deliveries
  for each row execute function public.notify_receipt_confirmation();
