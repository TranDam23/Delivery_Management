-- ============================================================================
-- Xu ly ngoai le van chuyen: nhap sai kho, giao sai khu vuc, chuyen kho that bai
-- va phan cong lai. Moi xu ly duoc ghi vao shipment_exceptions (nhat ky bat bien)
-- va thay doi tuyen duoc thuc hien nguyen tu trong mot ham SQL.
-- Khong sua cac bang/ham cua luong giao nhan hien co.
-- ============================================================================

create table if not exists public.shipment_exceptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  shipment_leg_id uuid references public.shipment_legs (id) on delete set null,
  exception_type text not null
    check (exception_type in ('WRONG_WAREHOUSE', 'WRONG_AREA', 'TRANSFER_FAILED', 'REASSIGNED')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  details jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_shipment_exceptions_order on public.shipment_exceptions (order_id, created_at desc);
create index if not exists idx_shipment_exceptions_created on public.shipment_exceptions (created_at desc);

alter table public.shipment_exceptions enable row level security;

-- Thay the cac chang chua bat dau cua tuyen xuoi, cap nhat chang bi loi (neu co),
-- ghi su kien nhap kho (neu co) va ghi nhat ky ngoai le trong mot giao dich.
--   p_leg_id            chang bi loi (NULL khi chi doi kho giao)
--   p_keep_through      giu cac chang <= so thu tu nay, thay cac chang phia sau (NULL = khong doi tuyen)
--   p_leg_new_to        doi kho den cua chang bi loi va danh dau hoan tat (nhap sai kho)
--   p_leg_reset         dua chang bi loi ve PENDING, tang attempt_no (chuyen kho that bai)
--   p_new_legs          [{leg_type, from_warehouse_id, to_warehouse_id, responsibility_province}]
--   p_new_delivery_wh   kho giao moi cua don (giao sai khu vuc)
create or replace function public.apply_shipment_exception(
  p_order_id uuid,
  p_actor uuid,
  p_exception_type text,
  p_reason text,
  p_leg_id uuid,
  p_keep_through integer,
  p_leg_new_to uuid,
  p_leg_reset boolean,
  p_new_legs jsonb,
  p_new_delivery_wh uuid,
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
  v_leg public.shipment_legs%rowtype;
  v_blocked integer;
  v_item jsonb;
  v_seq integer;
  v_exception_id uuid;
  v_in_warehouse uuid;
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

  if p_leg_id is not null then
    select * into v_leg from public.shipment_legs where id = p_leg_id and order_id = p_order_id for update;
    if not found then raise exception 'Leg not found'; end if;
  end if;

  if p_keep_through is not null then
    -- Cac chang bi thay phai chua bat dau va chua co su kien nao.
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
  end if;

  if p_leg_new_to is not null then
    if v_leg.id is null or v_leg.status <> 'IN_PROGRESS' or v_leg.leg_type = 'LAST_MILE' then
      raise exception 'Leg cannot be received at another warehouse';
    end if;
    if exists (select 1 from public.warehouse_events where shipment_leg_id = v_leg.id and event_type = 'INBOUND' and attempt_no = v_leg.attempt_no) then
      raise exception 'Leg already received';
    end if;
    update public.shipment_legs
      set to_warehouse_id = p_leg_new_to, status = 'COMPLETED', completed_at = now()
      where id = v_leg.id;
    insert into public.warehouse_events (
      order_id, shipment_leg_id, warehouse_id, event_type, performed_by, attempt_no, package_condition, note
    ) values (
      p_order_id, v_leg.id, p_leg_new_to, 'INBOUND', p_actor, v_leg.attempt_no, 'INTACT',
      'Nhập sai kho — điều phối viên xử lý ngoại lệ: ' || btrim(p_reason)
    );
    select id into v_in_warehouse from public.order_statuses where code = 'IN_WAREHOUSE';
    if v_in_warehouse is not null then
      update public.orders set status_id = v_in_warehouse where id = p_order_id;
    end if;
  end if;

  if p_leg_reset then
    if v_leg.id is null or v_leg.leg_type <> 'TRANSFER' or v_leg.status <> 'IN_PROGRESS' then
      raise exception 'Only an in-progress transfer leg can be reset';
    end if;
    update public.shipment_legs
      set status = 'PENDING', started_at = null, completed_at = null, attempt_no = v_leg.attempt_no + 1
      where id = v_leg.id;
  end if;

  if p_new_delivery_wh is not null then
    update public.orders set delivery_warehouse_id = p_new_delivery_wh where id = p_order_id;
  end if;

  if p_new_legs is not null and jsonb_array_length(p_new_legs) > 0 then
    v_seq := coalesce(p_keep_through, 0);
    for v_item in select * from jsonb_array_elements(p_new_legs) loop
      v_seq := v_seq + 1;
      insert into public.shipment_legs (
        order_id, sequence_no, leg_type, from_warehouse_id, to_warehouse_id, responsibility_province, status
      ) values (
        p_order_id, v_seq, v_item ->> 'leg_type',
        nullif(v_item ->> 'from_warehouse_id', '')::uuid,
        nullif(v_item ->> 'to_warehouse_id', '')::uuid,
        nullif(v_item ->> 'responsibility_province', ''),
        'PENDING'
      );
    end loop;
  end if;

  insert into public.shipment_exceptions (order_id, shipment_leg_id, exception_type, reason, details, created_by)
  values (p_order_id, p_leg_id, p_exception_type, btrim(p_reason), coalesce(p_details, '{}'::jsonb), p_actor)
  returning id into v_exception_id;

  return v_exception_id;
end;
$$;

revoke all on function public.apply_shipment_exception(uuid, uuid, text, text, uuid, integer, uuid, boolean, jsonb, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_shipment_exception(uuid, uuid, text, text, uuid, integer, uuid, boolean, jsonb, uuid, jsonb)
  to service_role;
