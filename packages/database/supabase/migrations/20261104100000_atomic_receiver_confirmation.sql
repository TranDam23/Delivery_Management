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
  select s.code, c.user_id
    into v_status, v_receiver_user_id
    from public.orders o
    join public.order_statuses s on s.id = o.status_id
    join public.contacts c on c.id = o.receiver_id
   where o.id = p_order_id
   for update of o, c;

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

  select d.received_at
    into v_received_at
    from public.deliveries d
   where d.id = p_delivery_id
     and d.order_id = p_order_id
   for update;

  if not found then
    raise exception 'Delivery record not found';
  end if;

  if v_received_at is not null then
    if p_enqueue_blockchain then
      select b.id
        into v_event_id
        from public.blockchain_events b
       where b.order_id = p_order_id
         and b.event_type = p_event_type
         and b.event_payload ->> 'deliveryId' = p_delivery_id::text
         and (b.event_payload ->> 'confirmedAt')::timestamptz = v_received_at
       order by b.created_at desc
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
