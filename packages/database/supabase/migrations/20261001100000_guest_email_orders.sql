-- Khách vãng lai: đơn được tạo sau khi API xác thực email OTP.
-- Chỉ service role được ghi/đọc metadata riêng tư và gọi hàm tạo đơn.
insert into public.users (id, role_id, full_name, email, password_hash, status)
select 'e5ce953a-4162-4600-9ea4-708442af6839'::uuid, r.id,
       'Đơn khách vãng lai', 'guest-orders@delivertrust.internal',
       crypt(gen_random_uuid()::text, gen_salt('bf')), 'active'::public.user_status
from public.roles r where r.code = 'CUSTOMER'
on conflict (id) do nothing;

create table if not exists public.guest_orders (
  order_id uuid primary key references public.orders(id) on delete cascade,
  sender_email text not null,
  sender_phone text not null,
  verified_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint guest_orders_email_lowercase check (sender_email = lower(sender_email))
);
create index if not exists guest_orders_lookup_idx
  on public.guest_orders(sender_email, sender_phone, created_at desc);
alter table public.guest_orders enable row level security;
revoke all on public.guest_orders from anon, authenticated;

create or replace function public.create_guest_order(p_payload jsonb)
returns table(order_id uuid, tracking_code text, actor_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor constant uuid := 'e5ce953a-4162-4600-9ea4-708442af6839';
  v_sender uuid;
  v_receiver uuid;
  v_pickup uuid;
  v_delivery uuid;
  v_order uuid;
  v_status uuid;
begin
  if not exists (select 1 from public.users where id = v_actor) then
    raise exception 'Guest order actor missing';
  end if;
  select id into v_status from public.order_statuses where code = 'CREATED';
  if v_status is null then raise exception 'Order status seed missing'; end if;

  insert into public.contacts(user_id, type, name, phone, email)
  values (null, 'sender', p_payload #>> '{sender,name}', p_payload #>> '{sender,phone}', p_payload ->> 'email')
  returning id into v_sender;
  insert into public.contacts(user_id, type, name, phone)
  values (null, 'receiver', p_payload #>> '{receiver,name}', p_payload #>> '{receiver,phone}')
  returning id into v_receiver;
  insert into public.addresses(contact_id, recipient_name, phone, address_line, province, district, ward)
  values (v_sender, p_payload #>> '{sender,name}', p_payload #>> '{sender,phone}',
          p_payload #>> '{sender,addressLine}', p_payload #>> '{sender,province}',
          nullif(p_payload #>> '{sender,district}', ''), p_payload #>> '{sender,ward}')
  returning id into v_pickup;
  insert into public.addresses(contact_id, recipient_name, phone, address_line, province, district, ward)
  values (v_receiver, p_payload #>> '{receiver,name}', p_payload #>> '{receiver,phone}',
          p_payload #>> '{receiver,addressLine}', p_payload #>> '{receiver,province}',
          nullif(p_payload #>> '{receiver,district}', ''), p_payload #>> '{receiver,ward}')
  returning id into v_delivery;

  insert into public.orders(tracking_code, qr_code, sender_id, receiver_id,
      pickup_address_id, delivery_address_id, pickup_warehouse_id,
      delivery_warehouse_id, service_type, cod_amount, total_fee, note, status_id, created_by)
  values (p_payload ->> 'trackingCode', p_payload ->> 'trackingCode', v_sender, v_receiver,
      v_pickup, v_delivery, (p_payload ->> 'pickupWarehouseId')::uuid,
      (p_payload ->> 'deliveryWarehouseId')::uuid, p_payload ->> 'serviceType',
      (p_payload ->> 'codAmount')::numeric, (p_payload ->> 'totalFee')::numeric,
      nullif(p_payload ->> 'note', ''), v_status, v_actor)
  returning id into v_order;

  insert into public.order_items(order_id, item_name, item_type, quantity, weight, declared_value, note)
  values (v_order, p_payload #>> '{item,name}', nullif(p_payload #>> '{item,type}', ''),
      (p_payload #>> '{item,quantity}')::integer,
      nullif(p_payload #>> '{item,weight}', '')::numeric,
      nullif(p_payload #>> '{item,declaredValue}', '')::numeric,
      nullif(p_payload #>> '{item,note}', ''));
  insert into public.guest_orders(order_id, sender_email, sender_phone, verified_auth_user_id)
  values (v_order, lower(p_payload ->> 'email'), p_payload #>> '{sender,phone}',
          (p_payload ->> 'verifiedAuthUserId')::uuid);
  return query select v_order, p_payload ->> 'trackingCode', v_actor;
end;
$$;

revoke all on function public.create_guest_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_guest_order(jsonb) to service_role;
