alter table public.orders
  add column sender_user_id uuid references public.users(id) on delete set null,
  add column receiver_user_id uuid references public.users(id) on delete set null,
  add column public_tracking_token text not null
    default ('trk_' || pg_catalog.gen_random_uuid()::text);

create index idx_orders_sender_user_id
  on public.orders(sender_user_id)
  where sender_user_id is not null;
create index idx_orders_receiver_user_id
  on public.orders(receiver_user_id)
  where receiver_user_id is not null;
create unique index orders_public_tracking_token_key
  on public.orders(public_tracking_token);

update public.orders as o
   set sender_user_id = o.created_by
  from public.contacts as sender
  join public.users as creator on creator.id = sender.user_id
  join public.roles as creator_role on creator_role.id = creator.role_id
 where sender.id = o.sender_id
   and sender.user_id = o.created_by
   and creator_role.code = 'CUSTOMER'
   and o.sender_user_id is null;

create or replace function public.create_order_with_items(
  p_order jsonb,
  p_items jsonb,
  p_idempotency_key uuid,
  p_request_hash text
)
returns table (
  id uuid,
  tracking_code text,
  qr_code text,
  pickup_warehouse_id uuid,
  delivery_warehouse_id uuid,
  was_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item_count integer;
  v_created_by uuid;
  v_sender_user_id uuid;
  v_receiver_user_id uuid;
  v_creator_role text;
  v_creator_status text;
begin
  if p_idempotency_key is null
    or p_request_hash is null
    or p_request_hash !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(p_order) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid order creation request';
  end if;

  if not (p_order ?& array[
    'tracking_code',
    'qr_code',
    'sender_id',
    'receiver_id',
    'pickup_address_id',
    'delivery_address_id',
    'pickup_warehouse_id',
    'delivery_warehouse_id',
    'service_type',
    'cod_amount',
    'total_fee',
    'shipping_fee_payer',
    'shipping_payment_method',
    'note',
    'status_id',
    'created_by'
  ]) or exists (
    select 1
      from pg_catalog.unnest(array[
        'tracking_code',
        'qr_code',
        'sender_id',
        'receiver_id',
        'pickup_address_id',
        'delivery_address_id',
        'pickup_warehouse_id',
        'delivery_warehouse_id',
        'service_type',
        'cod_amount',
        'total_fee',
        'status_id',
        'created_by'
      ]) as required(field_name)
     where nullif(pg_catalog.btrim(p_order ->> required.field_name), '') is null
  ) then
    raise exception 'Required order fields are missing';
  end if;

  if p_order ->> 'service_type' not in ('standard', 'express', 'same_day') then
    raise exception 'Invalid order service type';
  end if;

  v_created_by := (p_order ->> 'created_by')::uuid;
  v_sender_user_id := nullif(p_order ->> 'sender_user_id', '')::uuid;
  v_receiver_user_id := nullif(p_order ->> 'receiver_user_id', '')::uuid;

  select role.code, creator.status::text
    into v_creator_role, v_creator_status
    from public.users as creator
    join public.roles as role on role.id = creator.role_id
   where creator.id = v_created_by
   for share of creator;
  if not found then
    raise exception 'Order creator not found';
  end if;
  if v_creator_role not in ('ADMIN', 'CUSTOMER') then
    raise exception 'Order creator role is not permitted';
  end if;

  if v_creator_role = 'CUSTOMER' then
    if v_creator_status <> 'active'
      or v_sender_user_id is distinct from v_created_by
      or not exists (
        select 1
          from public.contacts as sender
         where sender.id = (p_order ->> 'sender_id')::uuid
           and sender.user_id = v_created_by
      ) then
      raise exception 'Customer sender identity is invalid';
    end if;
  elsif v_sender_user_id is not null then
    raise exception 'Only a customer can be recorded as the sender account';
  end if;

  if v_receiver_user_id is not null
    and (v_creator_role <> 'CUSTOMER' or v_receiver_user_id is distinct from v_created_by) then
    raise exception 'Receiver account must be explicitly identified as the customer sender';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_items) as entry(value)
     where pg_catalog.jsonb_typeof(entry.value) is distinct from 'object'
  ) then
    raise exception 'Order items must be objects';
  end if;

  v_item_count := pg_catalog.jsonb_array_length(p_items);
  if v_item_count = 0 then
    raise exception 'At least one order item is required';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_to_recordset(p_items) as item(
        item_name text,
        quantity integer,
        weight numeric,
        length numeric,
        width numeric,
        height numeric,
        declared_value numeric
      )
     where item.item_name is null
        or pg_catalog.btrim(item.item_name) = ''
        or item.quantity is null
        or item.quantity < 1
        or item.quantity > 10000
        or (item.weight is not null and (item.weight <= 0 or item.weight > 10000))
        or (item.length is not null and (item.length <= 0 or item.length > 1000))
        or (item.width is not null and (item.width <= 0 or item.width > 1000))
        or (item.height is not null and (item.height <= 0 or item.height > 1000))
        or (item.declared_value is not null and (
          item.declared_value < 0
          or item.declared_value > 999999999999.99
          or item.declared_value * 100 <> pg_catalog.trunc(item.declared_value * 100)
        ))
  ) then
    raise exception 'Invalid order item';
  end if;

  insert into public.orders (
    tracking_code,
    qr_code,
    sender_id,
    receiver_id,
    sender_user_id,
    receiver_user_id,
    pickup_address_id,
    delivery_address_id,
    pickup_warehouse_id,
    delivery_warehouse_id,
    service_type,
    cod_amount,
    total_fee,
    shipping_fee_payer,
    shipping_payment_method,
    shipping_payment_status,
    note,
    status_id,
    created_by,
    creation_idempotency_key,
    creation_request_hash
  ) values (
    p_order ->> 'tracking_code',
    p_order ->> 'qr_code',
    (p_order ->> 'sender_id')::uuid,
    (p_order ->> 'receiver_id')::uuid,
    v_sender_user_id,
    v_receiver_user_id,
    (p_order ->> 'pickup_address_id')::uuid,
    (p_order ->> 'delivery_address_id')::uuid,
    (p_order ->> 'pickup_warehouse_id')::uuid,
    (p_order ->> 'delivery_warehouse_id')::uuid,
    p_order ->> 'service_type',
    (p_order ->> 'cod_amount')::numeric,
    (p_order ->> 'total_fee')::numeric,
    p_order ->> 'shipping_fee_payer',
    p_order ->> 'shipping_payment_method',
    'pending',
    nullif(p_order ->> 'note', ''),
    (p_order ->> 'status_id')::uuid,
    v_created_by,
    p_idempotency_key,
    p_request_hash
  )
  on conflict (created_by, creation_idempotency_key) do nothing
  returning * into v_order;

  if not found then
    select *
      into v_order
      from public.orders
     where created_by = v_created_by
       and creation_idempotency_key = p_idempotency_key
     for update;

    if not found then
      raise exception 'Order idempotency record could not be loaded';
    end if;
    if v_order.creation_request_hash is distinct from p_request_hash then
      raise exception 'ORDER_IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;

    return query
      select v_order.id, v_order.tracking_code, v_order.qr_code,
        v_order.pickup_warehouse_id, v_order.delivery_warehouse_id, false;
    return;
  end if;

  insert into public.order_items (
    order_id,
    item_name,
    item_type,
    quantity,
    weight,
    length,
    width,
    height,
    declared_value,
    note
  )
  select
    v_order.id,
    item.item_name,
    item.item_type,
    item.quantity,
    item.weight,
    item.length,
    item.width,
    item.height,
    item.declared_value,
    item.note
  from pg_catalog.jsonb_to_recordset(p_items) as item(
    item_name text,
    item_type text,
    quantity integer,
    weight numeric,
    length numeric,
    width numeric,
    height numeric,
    declared_value numeric,
    note text
  );

  return query
    select v_order.id, v_order.tracking_code, v_order.qr_code,
      v_order.pickup_warehouse_id, v_order.delivery_warehouse_id, true;
end;
$$;

revoke all on function public.create_order_with_items(jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_order_with_items(jsonb, jsonb, uuid, text)
  to service_role;

create or replace function public.confirm_receiver_delivery_atomic(
  p_order_id uuid,
  p_delivery_id uuid,
  p_user_id uuid,
  p_user_role text,
  p_confirmed_at timestamptz,
  p_note text,
  p_enqueue_blockchain boolean,
  p_event_type text,
  p_event_data_hash text,
  p_event_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_receiver_user_id uuid;
  v_received_at timestamptz;
  v_event_id uuid;
begin
  if p_order_id is null
    or p_delivery_id is null
    or p_user_id is null
    or p_confirmed_at is null then
    raise exception 'Invalid receipt confirmation request';
  end if;

  select status.code, o.receiver_user_id
    into v_status, v_receiver_user_id
    from public.orders as o
    join public.order_statuses as status on status.id = o.status_id
   where o.id = p_order_id
   for update of o;

  if not found then
    raise exception 'Order not found';
  end if;
  if p_user_role is null
     or p_user_role not in ('ADMIN', 'CUSTOMER')
     or (p_user_role = 'CUSTOMER' and v_receiver_user_id is distinct from p_user_id) then
    raise exception 'Forbidden';
  end if;
  if v_status <> 'DELIVERED' then
    raise exception 'Order is not delivered';
  end if;

  select delivery.received_at
    into v_received_at
    from public.deliveries as delivery
   where delivery.id = p_delivery_id
     and delivery.order_id = p_order_id
   for update;

  if not found then
    raise exception 'Delivery record not found';
  end if;

  if v_received_at is not null then
    if p_enqueue_blockchain then
      select event.id
        into v_event_id
        from public.blockchain_events as event
       where event.order_id = p_order_id
         and event.event_type = p_event_type
         and event.event_payload ->> 'deliveryId' = p_delivery_id::text
       order by event.created_at desc
       limit 1;
    end if;
    return jsonb_build_object(
      'status', 'already_confirmed',
      'confirmed_at', v_received_at,
      'event_id', v_event_id
    );
  end if;

  update public.deliveries
     set received_at = p_confirmed_at
   where id = p_delivery_id
     and order_id = p_order_id
     and received_at is null
   returning received_at into v_received_at;

  if not found then
    raise exception 'Receipt confirmation lost its conditional update';
  end if;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) values (
    p_user_id,
    'RECEIVER_CONFIRMED',
    'orders',
    p_order_id,
    jsonb_build_object('received_at', null),
    jsonb_build_object(
      'received_at', v_received_at,
      'note', p_note
    )
  );

  if p_enqueue_blockchain then
    if p_event_type is null or p_event_data_hash is null or p_event_payload is null then
      raise exception 'Blockchain event data is required';
    end if;

    insert into public.blockchain_events (
      order_id,
      event_type,
      event_data_hash,
      event_payload,
      performed_by,
      tx_status
    ) values (
      p_order_id,
      p_event_type,
      p_event_data_hash,
      p_event_payload,
      p_user_id,
      'pending'
    )
    returning id into v_event_id;
  end if;

  return jsonb_build_object(
    'status', 'confirmed',
    'confirmed_at', v_received_at,
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.confirm_receiver_delivery_atomic(
  uuid, uuid, uuid, text, timestamptz, text, boolean, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.confirm_receiver_delivery_atomic(
  uuid, uuid, uuid, text, timestamptz, text, boolean, text, text, jsonb
) to service_role;
