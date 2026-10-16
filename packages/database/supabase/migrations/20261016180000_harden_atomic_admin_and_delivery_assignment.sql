drop function if exists public.assign_delivery_atomic(uuid, uuid, uuid, uuid, timestamptz);

create or replace function public.assign_delivery_atomic(
  p_order_id uuid,
  p_shipment_leg_id uuid,
  p_delivery_staff_id uuid,
  p_assigned_by uuid,
  p_assigned_at timestamptz,
  p_expected_updated_at timestamptz,
  p_expected_status text,
  p_expected_assigned_staff_id uuid
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
  v_existing_delivery public.deliveries%rowtype;
  v_delivery public.deliveries%rowtype;
  v_attempts integer;
  v_max_attempts integer;
  v_previous_status text;
  v_previous_leg_type text;
  v_previous_is_return boolean;
  v_has_inbound boolean;
  v_assigned_status_id uuid;
  v_order_status_id uuid;
  v_order_status_code text;
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
  if v_leg.updated_at is distinct from p_expected_updated_at
    or v_leg.status is distinct from p_expected_status
    or v_leg.assigned_staff_id is distinct from p_expected_assigned_staff_id then
    raise exception 'LEG_CHANGED';
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

  perform 1
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
    if v_existing_delivery.id is null then
      raise exception 'FAILED_DELIVERY_NOT_FOUND';
    end if;

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

  if v_leg.leg_type = 'LAST_MILE' and v_leg.sequence_no > 1 then
    select status, leg_type, is_return
    into v_previous_status, v_previous_leg_type, v_previous_is_return
    from public.shipment_legs
    where order_id = v_leg.order_id
      and sequence_no = v_leg.sequence_no - 1
    for update;

    if not found
      or (
        v_previous_status <> 'COMPLETED'
        and not (
          v_leg.is_return
          and not coalesce(v_previous_is_return, false)
          and v_previous_leg_type = 'LAST_MILE'
          and v_previous_status = 'FAILED'
        )
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
    select o.status_id, s.code
    into v_order_status_id, v_order_status_code
    from public.orders o
    join public.order_statuses s on s.id = o.status_id
    where o.id = v_leg.order_id
    for update of o;

    if not found then
      raise exception 'ORDER_STATUS_NOT_FOUND';
    end if;

    if v_order_status_code in ('CREATED', 'PENDING_ASSIGNMENT') then
      select id
      into v_assigned_status_id
      from public.order_statuses
      where code = 'ASSIGNED';

      if not found then
        raise exception 'ASSIGNED_STATUS_NOT_FOUND';
      end if;

      update public.orders
      set status_id = v_assigned_status_id
      where id = v_leg.order_id
        and status_id = v_order_status_id;

      if not found then
        raise exception 'ORDER_STATUS_UPDATE_FAILED';
      end if;
    end if;
  end if;

  return to_jsonb(v_delivery);
end;
$$;

revoke all on function public.assign_delivery_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_delivery_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid)
  to service_role;

create or replace function public.update_admin_managed_user_atomic(
  p_user_id uuid,
  p_actor_id uuid,
  p_role_id uuid,
  p_set_role boolean,
  p_status public.user_status,
  p_set_status boolean,
  p_full_name text,
  p_set_full_name boolean,
  p_phone text,
  p_set_phone boolean,
  p_warehouse_id uuid,
  p_set_warehouse boolean,
  p_province text,
  p_set_province boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_current_role_code text;
  v_next_role_code text;
  v_next_status public.user_status;
  v_active_admin_count integer;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(181923901, 1);

  select *
  into v_user
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  select code
  into v_current_role_code
  from public.roles
  where id = v_user.role_id;

  if not found then
    raise exception 'USER_ROLE_NOT_FOUND';
  end if;

  if p_set_role then
    if p_role_id is null then
      raise exception 'ROLE_NOT_FOUND';
    end if;
    select code
    into v_next_role_code
    from public.roles
    where id = p_role_id;
    if not found then
      raise exception 'ROLE_NOT_FOUND';
    end if;
  else
    v_next_role_code := v_current_role_code;
  end if;

  v_next_status := case when p_set_status then p_status else v_user.status end;
  if p_user_id = p_actor_id
    and (v_next_role_code <> 'ADMIN' or v_next_status <> 'active') then
    raise exception 'SELF_ADMIN_MODIFICATION';
  end if;

  if v_current_role_code = 'ADMIN'
    and v_user.status = 'active'
    and (v_next_role_code <> 'ADMIN' or v_next_status <> 'active') then
    select count(*)::integer
    into v_active_admin_count
    from public.users u
    join public.roles r on r.id = u.role_id
    where r.code = 'ADMIN'
      and u.status = 'active'
      and u.id <> p_user_id;

    if v_active_admin_count = 0 then
      raise exception 'LAST_ACTIVE_ADMIN';
    end if;
  end if;

  update public.users
  set role_id = case when p_set_role then p_role_id else role_id end,
      status = case when p_set_status then p_status else status end,
      full_name = case when p_set_full_name then p_full_name else full_name end,
      phone = case when p_set_phone then p_phone else phone end,
      warehouse_id = case when p_set_warehouse then p_warehouse_id else warehouse_id end,
      province = case when p_set_province then p_province else province end
  where id = p_user_id;

  if p_set_status and p_status <> 'active' then
    update public.refresh_tokens
    set revoked_at = now()
    where user_id = p_user_id
      and revoked_at is null;
  end if;

  select jsonb_build_object(
    'id', u.id,
    'full_name', u.full_name,
    'email', u.email,
    'phone', u.phone,
    'province', u.province,
    'warehouse_id', u.warehouse_id,
    'status', u.status,
    'roles', jsonb_build_object('code', r.code, 'name', r.name),
    'warehouses', case
      when w.id is null then null
      else jsonb_build_object(
        'id', w.id,
        'code', w.code,
        'name', w.name,
        'province', w.province,
        'warehouse_level', w.warehouse_level
      )
    end
  )
  into v_result
  from public.users u
  join public.roles r on r.id = u.role_id
  left join public.warehouses w on w.id = u.warehouse_id
  where u.id = p_user_id;

  return v_result;
end;
$$;

create or replace function public.create_admin_user_atomic(
  p_full_name text,
  p_email text,
  p_password_hash text,
  p_phone text,
  p_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role_code text;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(181923901, 1);

  select code
  into v_role_code
  from public.roles
  where id = p_role_id;
  if not found or v_role_code <> 'ADMIN' then
    raise exception 'ADMIN_ROLE_INVALID';
  end if;

  insert into public.users (
    full_name,
    email,
    password_hash,
    phone,
    role_id,
    status
  )
  values (
    p_full_name,
    p_email,
    p_password_hash,
    p_phone,
    p_role_id,
    'active'
  )
  returning id into v_user_id;

  select jsonb_build_object(
    'id', u.id,
    'full_name', u.full_name,
    'email', u.email,
    'phone', u.phone,
    'province', u.province,
    'warehouse_id', u.warehouse_id,
    'status', u.status,
    'roles', jsonb_build_object('code', r.code, 'name', r.name),
    'warehouses', case
      when w.id is null then null
      else jsonb_build_object(
        'id', w.id,
        'code', w.code,
        'name', w.name,
        'province', w.province,
        'warehouse_level', w.warehouse_level
      )
    end
  )
  into v_result
  from public.users u
  join public.roles r on r.id = u.role_id
  left join public.warehouses w on w.id = u.warehouse_id
  where u.id = v_user_id;

  return v_result;
end;
$$;

revoke all on function public.update_admin_managed_user_atomic(
  uuid, uuid, uuid, boolean, public.user_status, boolean, text, boolean,
  text, boolean, uuid, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.update_admin_managed_user_atomic(
  uuid, uuid, uuid, boolean, public.user_status, boolean, text, boolean,
  text, boolean, uuid, boolean, text, boolean
) to service_role;

revoke all on function public.create_admin_user_atomic(text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_admin_user_atomic(text, text, text, text, uuid)
  to service_role;
