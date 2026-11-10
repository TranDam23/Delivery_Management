-- ============================================================================
-- Gioi han so don phan cong moi ngay cho shipper va phan loai shipper lay hang / giao hang.
--   users.shipper_type            PICKUP (chi lay hang) | DELIVERY (chi giao hang) | BOTH (mac dinh, giu nguyen hanh vi cu)
--   users.daily_assignment_limit  gioi han rieng; NULL = dung SHIPPER_DAILY_ASSIGNMENT_LIMIT (mac dinh 20)
-- Trigger tren shipment_legs chan o tang CSDL (nguyen tu, bao ca moi duong phan cong) khi shipper da du don
-- trong ngay (gio Viet Nam) hoac sai loai shipper cho chang.
-- ============================================================================

alter table public.users
  add column if not exists shipper_type text not null default 'BOTH',
  add column if not exists daily_assignment_limit integer;

alter table public.users drop constraint if exists users_shipper_type_check;
alter table public.users
  add constraint users_shipper_type_check check (shipper_type in ('PICKUP', 'DELIVERY', 'BOTH'));
alter table public.users drop constraint if exists users_daily_assignment_limit_check;
alter table public.users
  add constraint users_daily_assignment_limit_check check (daily_assignment_limit is null or daily_assignment_limit between 1 and 500);

insert into public.system_settings (key, value, description) values
  ('SHIPPER_DAILY_ASSIGNMENT_LIMIT', '20', 'So don toi da duoc phan cong cho mot shipper trong mot ngay (gio Viet Nam)')
on conflict (key) do nothing;

create index if not exists idx_shipment_legs_staff_assigned_at
  on public.shipment_legs (assigned_staff_id, assigned_at)
  where assigned_staff_id is not null;

create or replace function public.enforce_shipper_assignment_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type text;
  v_limit integer;
  v_default text;
  v_day_start timestamptz;
  v_count integer;
begin
  if new.assigned_staff_id is null or new.leg_type = 'TRANSFER' then return new; end if;
  -- Giu nguyen nguoi phu trach (vi du giao lai cung shipper) thi khong kiem tra lai.
  if tg_op = 'UPDATE' and old.assigned_staff_id is not distinct from new.assigned_staff_id then return new; end if;
  if new.status = 'CANCELLED' then return new; end if;

  select shipper_type, daily_assignment_limit into v_type, v_limit
  from public.users where id = new.assigned_staff_id;
  if v_type is null then return new; end if;

  if (new.leg_type = 'PICKUP' and v_type = 'DELIVERY') or (new.leg_type = 'LAST_MILE' and v_type = 'PICKUP') then
    raise exception 'SHIPPER_TYPE_MISMATCH: shipper khong thuoc loai phu hop voi chang nay';
  end if;

  if v_limit is null then
    select value into v_default from public.system_settings where key = 'SHIPPER_DAILY_ASSIGNMENT_LIMIT';
    v_limit := coalesce(nullif(v_default, '')::integer, 20);
  end if;

  v_day_start := (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')) at time zone 'Asia/Ho_Chi_Minh';
  select count(*) into v_count
  from public.shipment_legs l
  where l.assigned_staff_id = new.assigned_staff_id
    and l.id is distinct from new.id
    and l.status <> 'CANCELLED'
    and l.assigned_at >= v_day_start;

  if v_count >= v_limit then
    raise exception 'SHIPPER_DAILY_LIMIT_REACHED: shipper da du % don trong ngay', v_limit;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_shipper_assignment_rules on public.shipment_legs;
create trigger trg_enforce_shipper_assignment_rules
  before insert or update of assigned_staff_id on public.shipment_legs
  for each row execute function public.enforce_shipper_assignment_rules();
