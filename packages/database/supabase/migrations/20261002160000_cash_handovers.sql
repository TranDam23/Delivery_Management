-- Phiếu nộp tiền: shipper nộp về bưu cục (kho phát) toàn bộ tiền mặt đã thu hộ,
-- gồm COD và phí vận chuyển thu bằng tiền mặt, trong MỘT phiếu. Nhân viên kho
-- của bưu cục xác nhận đã nhận; chỉ COD đã nộp mới được đối soát.

create table public.cash_handovers (
  id uuid primary key default gen_random_uuid(),
  shipper_id uuid not null references public.users(id),
  warehouse_id uuid not null references public.warehouses(id),
  cod_amount numeric(14, 2) not null default 0,
  fee_amount numeric(14, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  submitted_at timestamptz not null default now(),
  confirmed_by uuid references public.users(id),
  confirmed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table public.cash_handover_items (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.cash_handovers(id) on delete cascade,
  order_id uuid not null references public.orders(id),
  kind text not null check (kind in ('cod', 'shipping_fee')),
  amount numeric(14, 2) not null
);

create index idx_cash_handovers_shipper on public.cash_handovers (shipper_id, submitted_at desc);
create index idx_cash_handovers_warehouse_status on public.cash_handovers (warehouse_id, status);
create index idx_cash_handover_items_handover on public.cash_handover_items (handover_id);

alter table public.cash_handovers enable row level security;
alter table public.cash_handover_items enable row level security;

alter table public.cod_transactions
  add column handover_id uuid references public.cash_handovers(id),
  add column handed_over_at timestamptz;
alter table public.orders
  add column shipping_handover_id uuid references public.cash_handovers(id);

comment on column public.cod_transactions.handed_over_at is 'Lúc nhân viên kho xác nhận đã nhận tiền COD shipper nộp về bưu cục. Bắt buộc trước khi đối soát.';
comment on column public.orders.shipping_handover_id is 'Phiếu nộp tiền chứa khoản phí vận chuyển tiền mặt shipper đã thu của đơn này.';

-- Tạo phiếu nộp từ mọi khoản tiền mặt shipper đã thu mà chưa nộp, nguyên tử trong một giao dịch.
create or replace function public.create_cash_handover(p_shipper uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_warehouse uuid;
  v_id uuid;
  v_cod numeric;
  v_fee numeric;
begin
  perform pg_advisory_xact_lock(hashtext(p_shipper::text));
  select warehouse_id into v_warehouse from public.users where id = p_shipper;
  if v_warehouse is null then
    raise exception 'SHIPPER_NO_WAREHOUSE';
  end if;

  insert into public.cash_handovers (shipper_id, warehouse_id) values (p_shipper, v_warehouse) returning id into v_id;

  with moved as (
    update public.cod_transactions
    set handover_id = v_id
    where collected_by = p_shipper and status = 'collected' and handover_id is null and handed_over_at is null
    returning order_id, amount
  )
  insert into public.cash_handover_items (handover_id, order_id, kind, amount)
  select v_id, order_id, 'cod', amount from moved;

  with moved as (
    update public.orders
    set shipping_handover_id = v_id
    where shipping_payment_method = 'cash' and shipping_payment_status = 'paid'
      and shipping_paid_by = p_shipper and shipping_handover_id is null
    returning id, total_fee
  )
  insert into public.cash_handover_items (handover_id, order_id, kind, amount)
  select v_id, id, 'shipping_fee', total_fee from moved;

  select coalesce(sum(amount) filter (where kind = 'cod'), 0), coalesce(sum(amount) filter (where kind = 'shipping_fee'), 0)
    into v_cod, v_fee from public.cash_handover_items where handover_id = v_id;
  if v_cod + v_fee = 0 then
    raise exception 'NOTHING_TO_HAND_OVER';
  end if;
  update public.cash_handovers set cod_amount = v_cod, fee_amount = v_fee where id = v_id;
  return v_id;
end;
$$;

create or replace function public.confirm_cash_handover(p_id uuid, p_user uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.cash_handovers
  set status = 'confirmed', confirmed_by = p_user, confirmed_at = now(), note = nullif(trim(p_note), '')
  where id = p_id and status = 'pending';
  if not found then
    raise exception 'HANDOVER_NOT_PENDING';
  end if;
  update public.cod_transactions set handed_over_at = now() where handover_id = p_id;
end;
$$;

-- Từ chối phiếu (sai số tiền, chưa nhận đủ...): nhả các khoản về để shipper lập phiếu lại.
create or replace function public.reject_cash_handover(p_id uuid, p_user uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.cash_handovers
  set status = 'rejected', confirmed_by = p_user, confirmed_at = now(), note = nullif(trim(p_note), '')
  where id = p_id and status = 'pending';
  if not found then
    raise exception 'HANDOVER_NOT_PENDING';
  end if;
  update public.cod_transactions set handover_id = null where handover_id = p_id and handed_over_at is null;
  update public.orders set shipping_handover_id = null where shipping_handover_id = p_id;
end;
$$;

revoke all on function public.create_cash_handover(uuid) from public, anon, authenticated;
revoke all on function public.confirm_cash_handover(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_cash_handover(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_cash_handover(uuid) to service_role;
grant execute on function public.confirm_cash_handover(uuid, uuid, text) to service_role;
grant execute on function public.reject_cash_handover(uuid, uuid, text) to service_role;
