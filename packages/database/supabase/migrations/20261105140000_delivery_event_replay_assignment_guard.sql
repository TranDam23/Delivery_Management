alter function public.record_delivery_event_atomic(
  uuid, uuid, text, integer, text, double precision, double precision,
  text, text, boolean, uuid, text
) rename to record_delivery_event_atomic_unchecked;

alter function public.record_delivery_event_atomic_unchecked(
  uuid, uuid, text, integer, text, double precision, double precision,
  text, text, boolean, uuid, text
) owner to postgres;

revoke all on function public.record_delivery_event_atomic_unchecked(
  uuid, uuid, text, integer, text, double precision, double precision,
  text, text, boolean, uuid, text
) from public, anon, authenticated, service_role;

create function public.record_delivery_event_atomic(
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
  v_leg public.shipment_legs%rowtype;
  v_delivery public.deliveries%rowtype;
begin
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

  if p_actor_role_code = 'DELIVERY_STAFF'
    and (
      v_delivery.delivery_staff_id is null
      or v_leg.assigned_staff_id is null
      or v_delivery.delivery_staff_id is distinct from v_leg.assigned_staff_id
      or v_delivery.delivery_staff_id is distinct from p_actor_id
      or v_leg.assigned_staff_id is distinct from p_actor_id
    ) then
    raise exception using errcode = 'P0001', message = 'DELIVERY_NOT_ASSIGNED';
  end if;

  return public.record_delivery_event_atomic_unchecked(
    p_delivery_id,
    p_actor_id,
    p_actor_role_code,
    p_expected_attempt_no,
    p_status_code,
    p_location_lat,
    p_location_lng,
    p_note,
    p_image_url,
    p_cod_collected,
    p_idempotency_key,
    p_request_hash
  );
end;
$$;

alter function public.record_delivery_event_atomic(
  uuid, uuid, text, integer, text, double precision, double precision,
  text, text, boolean, uuid, text
) owner to postgres;

revoke all on function public.record_delivery_event_atomic(
  uuid, uuid, text, integer, text, double precision, double precision,
  text, text, boolean, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_delivery_event_atomic(
  uuid, uuid, text, integer, text, double precision, double precision,
  text, text, boolean, uuid, text
) to service_role;
