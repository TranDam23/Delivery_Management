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
      from unnest(array[
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
    (p_order ->> 'created_by')::uuid,
    p_idempotency_key,
    p_request_hash
  )
  on conflict (created_by, creation_idempotency_key) do nothing
  returning * into v_order;

  if not found then
    select *
      into v_order
      from public.orders
     where created_by = (p_order ->> 'created_by')::uuid
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
