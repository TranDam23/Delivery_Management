-- Province-hub dispatchers operate every child warehouse in their province;
-- notifications must follow the same scope as the dispatcher API.
create or replace function public.notify_order_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare status_row record;
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
           'Đơn ' || new.tracking_code || ' đã được phân về kho thuộc phạm vi của bạn để phân công lấy hàng.'
    from public.users u
    join public.roles r on r.id = u.role_id and r.code = 'DISPATCHER'
    join public.warehouses assigned on assigned.id = u.warehouse_id
    join public.warehouses pickup on pickup.id = new.pickup_warehouse_id
    where u.status = 'active'
      and (u.warehouse_id = pickup.id
        or (assigned.warehouse_level = 'PROVINCE'
          and lower(trim(assigned.province)) = lower(trim(pickup.province))));
  end if;
  return new;
end;
$$;

create or replace function public.notify_operational_alert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.order_id is null then return new; end if;
  insert into public.notifications (user_id, order_id, type, title, message)
  select distinct u.id, new.order_id, 'delivery_abnormal', new.title, new.message
  from public.orders o
  join public.users u on u.status = 'active'
  join public.roles r on r.id = u.role_id and r.code = 'DISPATCHER'
  join public.warehouses assigned on assigned.id = u.warehouse_id
  join public.warehouses relevant on relevant.id in (o.pickup_warehouse_id, o.delivery_warehouse_id)
  where o.id = new.order_id
    and (assigned.id = relevant.id
      or (assigned.warehouse_level = 'PROVINCE'
        and lower(trim(assigned.province)) = lower(trim(relevant.province))));
  return new;
end;
$$;

create or replace function public.notify_warehouse_outbound()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_id uuid;
  tracking text;
  notice_title text;
  notice_message text;
begin
  if new.event_type = 'OUTBOUND' then
    select to_warehouse_id into target_id from public.shipment_legs where id = new.shipment_leg_id;
    if target_id is null or target_id = new.warehouse_id then return new; end if;
    notice_title := 'Hàng đang đến kho';
    notice_message := ' đã xuất kho; chuẩn bị xác nhận khi hàng đến.';
  elsif new.event_type = 'INBOUND' then
    target_id := new.warehouse_id;
    notice_title := 'Hàng đã đến kho';
    notice_message := ' đã được nhập kho; kiểm tra chặng tiếp theo.';
  else
    return new;
  end if;
  select tracking_code into tracking from public.orders where id = new.order_id;
  insert into public.notifications (user_id, order_id, type, title, message)
  select distinct u.id, new.order_id, 'system', notice_title,
         'Đơn ' || tracking || notice_message
  from public.warehouses target
  join public.users u on u.status = 'active'
  join public.roles r on r.id = u.role_id and r.code in ('WAREHOUSE_STAFF', 'DISPATCHER')
  join public.warehouses assigned on assigned.id = u.warehouse_id
  where target.id = target_id
    and (assigned.id = target.id
      or (r.code = 'DISPATCHER' and assigned.warehouse_level = 'PROVINCE'
        and lower(trim(assigned.province)) = lower(trim(target.province))));
  return new;
end;
$$;
