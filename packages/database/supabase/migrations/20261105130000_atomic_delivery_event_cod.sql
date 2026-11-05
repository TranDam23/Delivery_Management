alter table public.delivery_events
  add column idempotency_key uuid,
  add column request_hash text,
  add column idempotency_result jsonb,
  add constraint delivery_events_idempotency_key_hash_pair_check
    check ((idempotency_key is null) = (request_hash is null)),
  add constraint delivery_events_request_hash_format_check
    check (request_hash is null or request_hash ~ '^[0-9a-f]{64}$'),
  add constraint delivery_events_idempotency_attempt_check
    check (idempotency_key is null or leg_attempt_no is not null);

create unique index idx_delivery_events_delivery_idempotency_key
  on public.delivery_events (delivery_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.record_delivery_event_atomic(
  p_delivery_id uuid,
  p_actor_id uuid,
  p_actor_role_code text,
  p_expected_attempt_no integer,
  p_status_code text,
  p_location_lat double precision,
  p_location_lng double precision,
  p_note text,
  p_image_url text,
  p_cod_collected boolean,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_initial_delivery record;
  v_delivery public.deliveries%rowtype;
  v_leg public.shipment_legs%rowtype;
  v_order record;
  v_actor record;
  v_existing_event public.delivery_events%rowtype;
  v_event public.delivery_events%rowtype;
  v_attempt public.delivery_attempts%rowtype;
  v_cod public.cod_transactions%rowtype;
  v_event_status_id uuid;
  v_delivering_status_id uuid;
  v_next_order_status_id uuid;
  v_event_status_code text;
  v_next_order_status_code text;
  v_chain_event_type text;
  v_window_start timestamptz;
  v_attempt_no integer;
  v_max_attempts integer;
  v_constraint_name text;
  v_result jsonb;
  v_is_failure boolean;
  v_is_delivered boolean;
  v_collects_cod boolean;
begin
  if p_delivery_id is null
    or p_actor_id is null
    or p_expected_attempt_no is null
    or p_expected_attempt_no < 1
    or p_status_code is null
    or p_status_code not in ('PICKED_UP', 'PICKUP_FAILED', 'DELIVERING', 'DELIVERED', 'DELIVERY_FAILED')
    or p_idempotency_key is null
    or p_request_hash is null
    or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_IDEMPOTENCY_REQUEST';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_EVENT_NOTE';
  end if;

  select d.order_id, d.shipment_leg_id
    into v_initial_delivery
    from public.deliveries as d
   where d.id = p_delivery_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'DELIVERY_NOT_FOUND';
  end if;
  if v_initial_delivery.shipment_leg_id is null then
    raise exception using errcode = 'P0001', message = 'DELIVERY_LEG_MISSING';
  end if;

  -- Use the same leg -> delivery -> order lock order as assignment RPCs.
  select *
    into v_leg
    from public.shipment_legs
   where id = v_initial_delivery.shipment_leg_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DELIVERY_LEG_MISSING';
  end if;

  select *
    into v_delivery
    from public.deliveries
   where id = p_delivery_id
   for update;
  if not found
    or v_delivery.order_id is distinct from v_initial_delivery.order_id
    or v_delivery.shipment_leg_id is distinct from v_leg.id then
    raise exception using errcode = 'P0001', message = 'DELIVERY_LEG_MISSING';
  end if;

  select o.id, o.tracking_code, o.cod_amount, o.status_id, s.code as status_code
    into v_order
    from public.orders as o
    join public.order_statuses as s on s.id = o.status_id
   where o.id = v_delivery.order_id
   for update of o;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_STATUS_MISSING';
  end if;

  select r.code as role_code, u.status::text as user_status
    into v_actor
    from public.users as u
    join public.roles as r on r.id = u.role_id
   where u.id = p_actor_id
   for share of u;
  if not found
    or v_actor.user_status <> 'active'
    or v_actor.role_code not in ('ADMIN', 'DELIVERY_STAFF')
    or v_actor.role_code is distinct from p_actor_role_code then
    raise exception using errcode = 'P0001', message = 'ACTOR_FORBIDDEN';
  end if;
  select *
    into v_existing_event
    from public.delivery_events
   where delivery_id = p_delivery_id
     and idempotency_key = p_idempotency_key
   for update;
  if found then
    if v_existing_event.performed_by is distinct from p_actor_id then
      raise exception using errcode = 'P0001', message = 'ACTOR_FORBIDDEN';
    end if;
    if v_existing_event.request_hash is distinct from p_request_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSED';
    end if;
    if v_existing_event.idempotency_result is null then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_RESULT_MISSING';
    end if;
    return pg_catalog.jsonb_set(v_existing_event.idempotency_result, '{was_created}', 'false'::jsonb, true);
  end if;

  if v_delivery.delivery_staff_id is distinct from v_leg.assigned_staff_id
    or v_leg.assigned_staff_id is null then
    raise exception using errcode = 'P0001', message = 'DELIVERY_NOT_ASSIGNED';
  end if;
  if v_actor.role_code = 'DELIVERY_STAFF'
    and (v_delivery.delivery_staff_id is distinct from p_actor_id
      or v_leg.assigned_staff_id is distinct from p_actor_id) then
    raise exception using errcode = 'P0001', message = 'DELIVERY_NOT_ASSIGNED';
  end if;

  if v_leg.attempt_no is distinct from p_expected_attempt_no then
    raise exception using errcode = 'P0001', message = 'STALE_DELIVERY_ATTEMPT';
  end if;

  v_is_failure := p_status_code in ('PICKUP_FAILED', 'DELIVERY_FAILED');
  v_is_delivered := p_status_code = 'DELIVERED';
  v_collects_cod := v_is_delivered and not v_leg.is_return and v_order.cod_amount > 0;
  if v_is_failure and nullif(pg_catalog.btrim(p_note), '') is null then
    raise exception using errcode = 'P0001', message = 'INVALID_EVENT_NOTE';
  end if;
  if v_is_delivered and nullif(pg_catalog.btrim(p_image_url), '') is null then
    raise exception using errcode = 'P0001', message = 'INVALID_DELIVERY_EVENT';
  end if;
  if v_collects_cod and p_cod_collected is distinct from true then
    raise exception using errcode = 'P0001', message = 'COD_CONFIRMATION_REQUIRED';
  end if;

  v_window_start := coalesce(v_leg.started_at, v_leg.assigned_at, '1970-01-01 00:00:00+00'::timestamptz);
  v_event_status_code := case
    when p_status_code = 'PICKUP_FAILED' then 'PENDING_ASSIGNMENT'
    when v_is_delivered and v_leg.is_return then 'RETURNED'
    else p_status_code
  end;
  select id
    into v_event_status_id
    from public.order_statuses
   where code = v_event_status_code;
  if v_event_status_id is null then
    raise exception using errcode = 'P0001', message = 'EVENT_STATUS_MISSING';
  end if;

  if p_status_code in ('PICKED_UP', 'PICKUP_FAILED') then
    if v_leg.leg_type <> 'PICKUP'
      or v_leg.status <> 'ASSIGNED'
      or v_order.status_code not in ('CREATED', 'PENDING_ASSIGNMENT', 'ASSIGNED') then
      raise exception using errcode = 'P0001', message = 'INVALID_DELIVERY_TRANSITION';
    end if;
    v_next_order_status_code := case
      when p_status_code = 'PICKED_UP' then 'PICKED_UP'
      else 'PENDING_ASSIGNMENT'
    end;
  else
    if v_leg.leg_type <> 'LAST_MILE' or v_leg.status <> 'IN_PROGRESS' then
      raise exception using errcode = 'P0001', message = 'INVALID_DELIVERY_TRANSITION';
    end if;

    if p_status_code = 'DELIVERING' then
      if (v_leg.is_return and v_order.status_code <> 'RETURNING')
        or (not v_leg.is_return and v_order.status_code not in ('IN_WAREHOUSE', 'IN_TRANSIT', 'REDELIVERY')) then
        raise exception using errcode = 'P0001', message = 'INVALID_DELIVERY_TRANSITION';
      end if;
      if not v_leg.is_return then
        v_next_order_status_code := 'DELIVERING';
      end if;
    else
      if v_order.status_code is distinct from (case when v_leg.is_return then 'RETURNING' else 'DELIVERING' end) then
        raise exception using errcode = 'P0001', message = 'INVALID_DELIVERY_TRANSITION';
      end if;

      select id
        into v_delivering_status_id
        from public.order_statuses
       where code = 'DELIVERING';
      if v_delivering_status_id is null or not exists (
        select 1
          from public.delivery_events as de
         where de.delivery_id = p_delivery_id
           and de.status_id = v_delivering_status_id
           and (
             de.leg_attempt_no = v_leg.attempt_no
             or (de.leg_attempt_no is null and de.event_time >= v_window_start)
           )
      ) then
        raise exception using errcode = 'P0001', message = 'DELIVERY_START_REQUIRED';
      end if;

      if v_is_delivered then
        v_next_order_status_code := case when v_leg.is_return then 'RETURNED' else 'DELIVERED' end;
      elsif not v_leg.is_return then
        select case
          when value ~ '^[1-9][0-9]{0,5}$' then value::integer
          else 3
        end
          into v_max_attempts
          from public.system_settings
         where key = 'MAX_DELIVERY_ATTEMPTS';
        v_max_attempts := greatest(1, coalesce(v_max_attempts, 3));

        v_attempt_no := v_leg.attempt_no;
        v_next_order_status_code := case
          when v_attempt_no < v_max_attempts then 'REDELIVERY'
          else 'DELIVERY_FAILED'
        end;
      end if;
    end if;
  end if;

  if exists (
    select 1
      from public.delivery_events as de
     where de.delivery_id = p_delivery_id
       and de.status_id = v_event_status_id
       and (
         de.leg_attempt_no = v_leg.attempt_no
         or (de.leg_attempt_no is null and de.event_time >= v_window_start)
       )
  ) then
    raise exception using errcode = 'P0001', message = 'EVENT_ALREADY_RECORDED';
  end if;

  begin
    insert into public.delivery_events (
      delivery_id,
      order_id,
      status_id,
      leg_attempt_no,
      idempotency_key,
      request_hash,
      from_status_id,
      performed_by,
      event_time,
      location_lat,
      location_lng,
      note,
      image_url
    ) values (
      p_delivery_id,
      v_delivery.order_id,
      v_event_status_id,
      v_leg.attempt_no,
      p_idempotency_key,
      p_request_hash,
      v_order.status_id,
      p_actor_id,
      pg_catalog.clock_timestamp(),
      p_location_lat,
      p_location_lng,
      nullif(pg_catalog.btrim(p_note), ''),
      p_image_url
    )
    returning * into v_event;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = 'idx_delivery_events_delivery_attempt_status_unique' then
        raise exception using errcode = 'P0001', message = 'EVENT_ALREADY_RECORDED';
      elsif v_constraint_name = 'idx_delivery_events_delivery_idempotency_key' then
        raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSED';
      else
        raise;
      end if;
  end;

  if p_status_code in ('DELIVERED', 'DELIVERY_FAILED') then
    v_attempt_no := v_leg.attempt_no;
    insert into public.delivery_attempts (
      delivery_id,
      attempt_no,
      attempt_time,
      result,
      reason_fail,
      note
    ) values (
      p_delivery_id,
      v_attempt_no,
      v_event.event_time,
      case when v_is_delivered then 'success'::public.delivery_attempt_result
        else 'failed'::public.delivery_attempt_result end,
      case when v_is_delivered then null else pg_catalog.btrim(p_note) end,
      nullif(pg_catalog.btrim(p_note), '')
    )
    returning * into v_attempt;
  end if;

  if p_status_code = 'PICKED_UP' then
    update public.shipment_legs
       set status = 'IN_PROGRESS',
           started_at = v_event.event_time
     where id = v_leg.id;
  elsif p_status_code in ('PICKUP_FAILED', 'DELIVERY_FAILED') then
    update public.shipment_legs
       set status = 'FAILED'
     where id = v_leg.id;
  elsif p_status_code = 'DELIVERED' then
    update public.shipment_legs
       set status = 'COMPLETED',
           completed_at = v_event.event_time
     where id = v_leg.id;
  end if;

  if v_next_order_status_code is not null then
    select id
      into v_next_order_status_id
      from public.order_statuses
     where code = v_next_order_status_code;
    if v_next_order_status_id is null then
      raise exception using errcode = 'P0001', message = 'NEXT_ORDER_STATUS_MISSING';
    end if;
    update public.orders
       set status_id = v_next_order_status_id
     where id = v_order.id
       and status_id = v_order.status_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'ORDER_STATUS_CHANGED';
    end if;
  end if;

  if v_collects_cod then
    begin
      insert into public.cod_transactions (
        order_id,
        amount,
        collected_by,
        collected_at,
        status,
        note
      ) values (
        v_order.id,
        v_order.cod_amount,
        p_actor_id,
        v_event.event_time,
        'collected',
        pg_catalog.format('Thu khi giao thành công, delivery %s', p_delivery_id)
      )
      returning * into v_cod;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint_name = constraint_name;
        if v_constraint_name = 'idx_cod_transactions_unique_order' then
          raise exception using errcode = 'P0001', message = 'COD_ALREADY_EXISTS';
        else
          raise;
        end if;
    end;
  end if;

  v_chain_event_type := case
    when v_leg.is_return and v_is_delivered then 'RETURNED'
    else p_status_code
  end;
  v_result := pg_catalog.jsonb_build_object(
    'event', pg_catalog.to_jsonb(v_event),
    'attempt', case when v_attempt.id is null then null else pg_catalog.to_jsonb(v_attempt) end,
    'order_status', coalesce(v_next_order_status_code, v_order.status_code),
    'cod_transaction', case when v_cod.id is null then null else pg_catalog.to_jsonb(v_cod) end,
    'was_created', true,
    'tracking_code', v_order.tracking_code,
    'shipment_leg_id', v_leg.id,
    'leg_type', v_leg.leg_type,
    'is_return', v_leg.is_return,
    'leg_attempt_no', v_leg.attempt_no,
    'from_status', v_order.status_code,
    'to_status', coalesce(v_next_order_status_code, v_order.status_code),
    'chain_event_type', v_chain_event_type,
    'cod_collected_amount', case when v_collects_cod then v_order.cod_amount else null end
  );
  update public.delivery_events
     set idempotency_result = v_result
   where id = v_event.id;

  return v_result;
end;
$$;

revoke all on function public.record_delivery_event_atomic(
  uuid, uuid, text, integer, text, double precision, double precision,
  text, text, boolean, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_delivery_event_atomic(
  uuid, uuid, text, integer, text, double precision, double precision,
  text, text, boolean, uuid, text
) to service_role;
