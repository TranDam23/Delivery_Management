-- Keep shipment leg, delivery, and order assignment updates in one transaction.
create or replace function public.assign_delivery_atomic(
  p_order_id uuid,
  p_shipment_leg_id uuid,
  p_delivery_staff_id uuid,
  p_assigned_by uuid,
  p_assigned_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg public.shipment_legs%rowtype;
  v_staff public.users%rowtype;
  v_role_code text;
  v_operational_warehouse_id uuid;
  v_warehouse public.warehouses%rowtype;
  v_existing_delivery public.deliveries%rowtype;
  v_delivery public.deliveries%rowtype;
  v_attempts integer;
  v_max_attempts integer;
  v_previous_status text;
  v_previous_leg_type text;
  v_previous_is_return boolean;
  v_has_inbound boolean;
  v_assigned_status_id uuid;
  v_assignable_status_ids uuid[];
  v_pickup_assigned boolean;
  v_next_attempt_no integer;
begin
  select *
  into v_leg
  from public.shipment_legs
  where id = p_shipment_leg_id
    and order_id = p_order_id
  for update;

  if not found then
    raise exception 'LEG_NOT_FOUND';
  end if;

  if v_leg.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'LEG_NOT_ASSIGNABLE';
  end if;
  if v_leg.status = 'IN_PROGRESS' then
    raise exception 'LEG_IN_PROGRESS';
  end if;
  if v_leg.leg_type = 'TRANSFER' then
    raise exception 'TRANSFER_NOT_ASSIGNABLE';
  end if;

  select u.*
  into v_staff
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = p_delivery_staff_id
  for update of u;

  if not found then
    raise exception 'STAFF_NOT_FOUND';
  end if;
  select r.code
  into v_role_code
  from public.roles r
  where r.id = v_staff.role_id;
  if v_staff.status <> 'active' then
    raise exception 'STAFF_INACTIVE';
  end if;
  if v_role_code <> 'DELIVERY_STAFF' then
    raise exception 'STAFF_ROLE_INVALID';
  end if;

  v_operational_warehouse_id := case
    when v_leg.leg_type = 'PICKUP' then v_leg.to_warehouse_id
    else v_leg.from_warehouse_id
  end;
  if v_operational_warehouse_id is null then
    raise exception 'WAREHOUSE_NOT_FOUND';
  end if;

  select *
  into v_warehouse
  from public.warehouses
  where id = v_operational_warehouse_id
  for update;

  if not found then
    raise exception 'WAREHOUSE_NOT_FOUND';
  end if;
  if v_staff.warehouse_id is distinct from v_operational_warehouse_id then
    raise exception 'STAFF_WAREHOUSE_MISMATCH';
  end if;

  select *
  into v_existing_delivery
  from public.deliveries
  where shipment_leg_id = v_leg.id
  for update;

  if v_leg.status = 'FAILED' and v_leg.leg_type = 'LAST_MILE' then
    if not v_leg.is_return then
      select count(*)::integer
      into v_attempts
      from public.delivery_attempts
      where delivery_id = v_existing_delivery.id;

      select greatest(1, coalesce(value::integer, 3))
      into v_max_attempts
      from public.system_settings
      where key = 'MAX_DELIVERY_ATTEMPTS';
      v_max_attempts := greatest(1, coalesce(v_max_attempts, 3));

      if v_attempts >= v_max_attempts then
        raise exception 'MAX_ATTEMPTS_REACHED';
      end if;
    end if;

    select exists (
      select 1
      from public.warehouse_events
      where shipment_leg_id = v_leg.id
        and warehouse_id = v_leg.from_warehouse_id
        and event_type = 'INBOUND'
        and attempt_no = coalesce(v_leg.attempt_no, 1)
    )
    into v_has_inbound;

    if not v_has_inbound then
      raise exception 'WAREHOUSE_INBOUND_REQUIRED';
    end if;
  end if;

  if v_leg.sequence_no > 1 then
    select status, leg_type, is_return
    into v_previous_status, v_previous_leg_type, v_previous_is_return
    from public.shipment_legs
    where order_id = v_leg.order_id
      and sequence_no = v_leg.sequence_no - 1;

    if found
      and v_previous_status <> 'COMPLETED'
      and not (
        v_leg.is_return
        and not coalesce(v_previous_is_return, false)
        and v_previous_leg_type = 'LAST_MILE'
        and v_previous_status = 'FAILED'
      ) then
      raise exception 'PREVIOUS_LEG_NOT_READY';
    end if;
  end if;

  v_next_attempt_no := greatest(1, coalesce(v_leg.attempt_no, 1));
  if v_leg.status = 'FAILED' then
    v_next_attempt_no := v_next_attempt_no + 1;
  end if;

  update public.shipment_legs
  set assigned_staff_id = v_staff.id,
      assigned_by = p_assigned_by,
      assigned_at = p_assigned_at,
      status = 'ASSIGNED',
      attempt_no = v_next_attempt_no,
      started_at = case when v_leg.status = 'FAILED' then null else started_at end,
      completed_at = case when v_leg.status = 'FAILED' then null else completed_at end
  where id = v_leg.id;

  if v_existing_delivery.id is null then
    insert into public.deliveries (
      order_id,
      shipment_leg_id,
      delivery_staff_id,
      assigned_by,
      assigned_at,
      is_return
    )
    values (
      v_leg.order_id,
      v_leg.id,
      v_staff.id,
      p_assigned_by,
      p_assigned_at,
      v_leg.is_return
    )
    returning * into v_delivery;
  else
    update public.deliveries
    set order_id = v_leg.order_id,
        shipment_leg_id = v_leg.id,
        delivery_staff_id = v_staff.id,
        assigned_by = p_assigned_by,
        assigned_at = p_assigned_at,
        is_return = v_leg.is_return
    where id = v_existing_delivery.id
    returning * into v_delivery;
  end if;

  select exists (
    select 1
    from public.shipment_legs
    where order_id = v_leg.order_id
      and leg_type = 'PICKUP'
      and status <> 'CANCELLED'
      and assigned_staff_id is not null
  )
  into v_pickup_assigned;

  if v_pickup_assigned then
    select id
    into v_assigned_status_id
    from public.order_statuses
    where code = 'ASSIGNED';

    select array_agg(id)
    into v_assignable_status_ids
    from public.order_statuses
    where code in ('CREATED', 'PENDING_ASSIGNMENT');

    if v_assigned_status_id is not null and coalesce(array_length(v_assignable_status_ids, 1), 0) > 0 then
      update public.orders
      set status_id = v_assigned_status_id
      where id = v_leg.order_id
        and status_id = any(v_assignable_status_ids);
    end if;
  end if;

  return to_jsonb(v_delivery);
end;
$$;

revoke all on function public.assign_delivery_atomic(uuid, uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.assign_delivery_atomic(uuid, uuid, uuid, uuid, timestamptz)
  to service_role;
