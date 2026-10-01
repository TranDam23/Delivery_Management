-- A phone number in an address book is not proof of account ownership. Only
-- the customer who created an authenticated order receives in-app updates.
-- Guest orders use a shared system actor and must never notify that account.
create or replace function public.notify_order_customers(
  p_order_id uuid, p_title text, p_message text, p_type text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, order_id, type, title, message)
  select u.id, o.id, p_type, p_title, p_message
  from public.orders o
  join public.users u on u.id = o.created_by and u.status = 'active'
  join public.roles r on r.id = u.role_id and r.code = 'CUSTOMER'
  where o.id = p_order_id
    and o.created_by <> 'e5ce953a-4162-4600-9ea4-708442af6839'::uuid
    and not exists (select 1 from public.guest_orders g where g.order_id = o.id);
end;
$$;
revoke all on function public.notify_order_customers(uuid, text, text, text) from public, anon, authenticated;

-- Store the recipient email at order creation. Updating an address-book entry
-- later must not change who may submit feedback for an existing order.
create table public.order_feedback_recipients (
  order_id uuid primary key references public.orders(id) on delete cascade,
  recipient_email text not null check (recipient_email = lower(recipient_email)),
  created_at timestamptz not null default now()
);
alter table public.order_feedback_recipients enable row level security;
revoke all on public.order_feedback_recipients from anon, authenticated;

create or replace function public.snapshot_order_feedback_recipient()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  select nullif(lower(trim(c.email)), '') into v_email
    from public.contacts c where c.id = new.receiver_id;
  if v_email is not null then
    insert into public.order_feedback_recipients(order_id, recipient_email)
    values (new.id, v_email);
  end if;
  return new;
end;
$$;
create trigger trg_snapshot_order_feedback_recipient
  after insert on public.orders for each row
  execute function public.snapshot_order_feedback_recipient();

create table public.order_feedback (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('REVIEW', 'COMPLAINT')),
  rating integer check (rating between 1 and 5),
  message text not null check (char_length(message) between 10 and 2000),
  verified_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint order_feedback_kind_rating_check check (
    (kind = 'REVIEW' and rating is not null) or
    (kind = 'COMPLAINT' and rating is null)
  )
);
create unique index order_feedback_one_review_per_order
  on public.order_feedback(order_id) where kind = 'REVIEW';
create unique index order_feedback_one_complaint_per_order
  on public.order_feedback(order_id) where kind = 'COMPLAINT';
create index order_feedback_order_created_idx
  on public.order_feedback(order_id, created_at desc);
alter table public.order_feedback enable row level security;
revoke all on public.order_feedback from anon, authenticated;

-- Operational alerts already have an acknowledgement/resolution lifecycle and
-- notify the dispatchers at the order's warehouses.
create or replace function public.alert_on_order_complaint()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tracking text;
begin
  if new.kind <> 'COMPLAINT' then return new; end if;
  select tracking_code into v_tracking from public.orders where id = new.order_id;
  insert into public.alerts(order_id, alert_type, title, message, details)
  values (new.order_id, 'CUSTOMER_COMPLAINT', 'Người nhận phản ánh đơn hàng',
          'Đơn ' || v_tracking || ' có phản ánh sau giao hàng. Cần kiểm tra và xử lý.',
          jsonb_build_object('feedback_id', new.id));
  return new;
end;
$$;
create trigger trg_alert_on_order_complaint
  after insert on public.order_feedback for each row
  execute function public.alert_on_order_complaint();

-- Supabase service-role RPC for guest orders. This replaces the first version
-- so the recipient email is present before the order snapshot trigger runs.
create or replace function public.create_guest_order(p_payload jsonb)
returns table(order_id uuid, tracking_code text, actor_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor constant uuid := 'e5ce953a-4162-4600-9ea4-708442af6839';
  v_sender uuid;
  v_receiver uuid;
  v_pickup uuid;
  v_delivery uuid;
  v_order uuid;
  v_status uuid;
begin
  if not exists (select 1 from public.users where id = v_actor) then
    raise exception 'Guest order actor missing';
  end if;
  if nullif(trim(p_payload #>> '{receiver,email}'), '') is null then
    raise exception 'Recipient email required';
  end if;
  select id into v_status from public.order_statuses where code = 'CREATED';
  if v_status is null then raise exception 'Order status seed missing'; end if;

  insert into public.contacts(user_id, type, name, phone, email)
  values (null, 'sender', p_payload #>> '{sender,name}', p_payload #>> '{sender,phone}', p_payload ->> 'email')
  returning id into v_sender;
  insert into public.contacts(user_id, type, name, phone, email)
  values (null, 'receiver', p_payload #>> '{receiver,name}', p_payload #>> '{receiver,phone}',
          lower(trim(p_payload #>> '{receiver,email}')))
  returning id into v_receiver;
  insert into public.addresses(contact_id, recipient_name, phone, address_line, province, district, ward)
  values (v_sender, p_payload #>> '{sender,name}', p_payload #>> '{sender,phone}',
          p_payload #>> '{sender,addressLine}', p_payload #>> '{sender,province}',
          nullif(p_payload #>> '{sender,district}', ''), p_payload #>> '{sender,ward}')
  returning id into v_pickup;
  insert into public.addresses(contact_id, recipient_name, phone, address_line, province, district, ward)
  values (v_receiver, p_payload #>> '{receiver,name}', p_payload #>> '{receiver,phone}',
          p_payload #>> '{receiver,addressLine}', p_payload #>> '{receiver,province}',
          nullif(p_payload #>> '{receiver,district}', ''), p_payload #>> '{receiver,ward}')
  returning id into v_delivery;

  insert into public.orders(tracking_code, qr_code, sender_id, receiver_id,
      pickup_address_id, delivery_address_id, pickup_warehouse_id,
      delivery_warehouse_id, service_type, cod_amount, total_fee, note, status_id, created_by)
  values (p_payload ->> 'trackingCode', p_payload ->> 'trackingCode', v_sender, v_receiver,
      v_pickup, v_delivery, (p_payload ->> 'pickupWarehouseId')::uuid,
      (p_payload ->> 'deliveryWarehouseId')::uuid, p_payload ->> 'serviceType',
      (p_payload ->> 'codAmount')::numeric, (p_payload ->> 'totalFee')::numeric,
      nullif(p_payload ->> 'note', ''), v_status, v_actor)
  returning id into v_order;

  insert into public.order_items(order_id, item_name, item_type, quantity, weight, declared_value, note)
  values (v_order, p_payload #>> '{item,name}', nullif(p_payload #>> '{item,type}', ''),
      (p_payload #>> '{item,quantity}')::integer,
      nullif(p_payload #>> '{item,weight}', '')::numeric,
      nullif(p_payload #>> '{item,declaredValue}', '')::numeric,
      nullif(p_payload #>> '{item,note}', ''));
  insert into public.guest_orders(order_id, sender_email, sender_phone, verified_auth_user_id)
  values (v_order, lower(p_payload ->> 'email'), p_payload #>> '{sender,phone}',
          (p_payload ->> 'verifiedAuthUserId')::uuid);
  return query select v_order, p_payload ->> 'trackingCode', v_actor;
end;
$$;
revoke all on function public.create_guest_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_guest_order(jsonb) to service_role;
