-- ============================================================================
-- Hoan hang thu cong: dieu phoi vien / Admin chu dong khoi tao tuyen hoan ve nguoi gui
-- khi hang dang nam o mot kho (khong can cho giao that bai du so lan).
-- Cac chang xuoi chua bat dau bi go, tuyen hoan duoc tao noi tiep, don chuyen sang RETURNING,
-- tat ca trong mot giao dich; ghi nhat ky vao shipment_exceptions.
-- ============================================================================

alter table public.shipment_exceptions drop constraint if exists shipment_exceptions_exception_type_check;
alter table public.shipment_exceptions
  add constraint shipment_exceptions_exception_type_check
  check (exception_type in ('WRONG_WAREHOUSE', 'WRONG_AREA', 'TRANSFER_FAILED', 'REASSIGNED', 'MANUAL_RETURN'));

--   p_keep_through  giu cac chang xuoi <= so thu tu nay, go cac chang xuoi phia sau (chua bat dau)
--   p_new_legs      [{leg_type, from_warehouse_id, to_warehouse_id, responsibility_province}] cua tuyen hoan
create or replace function public.start_manual_return(
  p_order_id uuid,
  p_actor uuid,
  p_reason text,
  p_keep_through integer,
  p_new_legs jsonb,
  p_details jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_status_code text;
  v_returning uuid;
  v_blocked integer;
  v_item jsonb;
  v_seq integer;
  v_exception_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  select code into v_status_code from public.order_statuses where id = v_order.status_id;
  if v_status_code in ('DELIVERED', 'RETURNED', 'CANCELLED', 'RETURNING') then
    raise exception 'Order is closed or returning';
  end if;
  if exists (select 1 from public.shipment_legs where order_id = p_order_id and is_return) then
    raise exception 'Order already has a return route';
  end if;
  if not exists (
    select 1 from public.shipment_legs
    where order_id = p_order_id and not is_return and leg_type = 'PICKUP' and status = 'COMPLETED'
  ) then
    raise exception 'Order has not been picked up';
  end if;
  if exists (
    select 1 from public.shipment_legs
    where order_id = p_order_id and not is_return and status = 'IN_PROGRESS'
  ) then
    raise exception 'A leg is still in progress';
  end if;
  if p_new_legs is null or jsonb_array_length(p_new_legs) = 0 then
    raise exception 'Return legs required';
  end if;

  select count(*) into v_blocked
  from public.shipment_legs l
  where l.order_id = p_order_id and not l.is_return and l.sequence_no > p_keep_through
    and (
      l.status in ('IN_PROGRESS', 'COMPLETED', 'FAILED')
      or exists (select 1 from public.warehouse_events e where e.shipment_leg_id = l.id)
      or exists (
        select 1 from public.deliveries d
        join public.delivery_events de on de.delivery_id = d.id
        where d.shipment_leg_id = l.id
      )
      or exists (
        select 1 from public.deliveries d
        join public.delivery_attempts da on da.delivery_id = d.id
        where d.shipment_leg_id = l.id
      )
    );
  if v_blocked > 0 then raise exception 'Remaining legs already started'; end if;

  delete from public.deliveries
  where shipment_leg_id in (
    select id from public.shipment_legs
    where order_id = p_order_id and not is_return and sequence_no > p_keep_through
  );
  delete from public.shipment_legs
  where order_id = p_order_id and not is_return and sequence_no > p_keep_through;

  v_seq := p_keep_through;
  for v_item in select * from jsonb_array_elements(p_new_legs) loop
    v_seq := v_seq + 1;
    insert into public.shipment_legs (
      order_id, sequence_no, leg_type, from_warehouse_id, to_warehouse_id, responsibility_province, status, is_return
    ) values (
      p_order_id, v_seq, v_item ->> 'leg_type',
      nullif(v_item ->> 'from_warehouse_id', '')::uuid,
      nullif(v_item ->> 'to_warehouse_id', '')::uuid,
      nullif(v_item ->> 'responsibility_province', ''),
      'PENDING', true
    );
  end loop;

  select id into v_returning from public.order_statuses where code = 'RETURNING';
  if v_returning is null then raise exception 'Order status seed missing'; end if;
  update public.orders set status_id = v_returning where id = p_order_id;

  insert into public.shipment_exceptions (order_id, shipment_leg_id, exception_type, reason, details, created_by)
  values (p_order_id, null, 'MANUAL_RETURN', btrim(p_reason), coalesce(p_details, '{}'::jsonb), p_actor)
  returning id into v_exception_id;

  return v_exception_id;
end;
$$;

revoke all on function public.start_manual_return(uuid, uuid, text, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.start_manual_return(uuid, uuid, text, integer, jsonb, jsonb) to service_role;

-- Thong bao cho kho dang giu hang khi mot don bi hoan thu cong (khach hang da duoc thong bao
-- boi trigger doi trang thai don sang RETURNING).
create or replace function public.notify_manual_return()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tracking text;
begin
  begin
    select tracking_code into v_tracking from public.orders where id = new.order_id;
    perform public.notify_warehouse_people(new.order_id, (new.details ->> 'holding_warehouse_id')::uuid,
      'Đơn cần hoàn về người gửi',
      'Đơn ' || coalesce(v_tracking, '') || ' được khởi tạo hoàn hàng; chuẩn bị xuất kho theo tuyến hoàn. Lý do: ' || new.reason,
      new.created_by);
  exception when others then
    raise warning 'notify_manual_return failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_manual_return on public.shipment_exceptions;
create trigger trg_notify_manual_return
  after insert on public.shipment_exceptions
  for each row when (new.exception_type = 'MANUAL_RETURN')
  execute function public.notify_manual_return();
