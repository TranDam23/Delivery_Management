-- Shipping fee payment is separate from COD collected for the goods.
-- Existing orders remain unspecified: do not invent who paid historical fees.
alter table public.orders
  add column shipping_fee_payer text,
  add column shipping_payment_method text,
  add column shipping_payment_status text not null default 'pending';

alter table public.orders
  add constraint orders_shipping_fee_payer_check
    check (shipping_fee_payer is null or shipping_fee_payer in ('sender', 'receiver')),
  add constraint orders_shipping_payment_method_check
    check (shipping_payment_method is null or shipping_payment_method in ('cash', 'vietqr', 'momo')),
  add constraint orders_shipping_payment_status_check
    check (shipping_payment_status in ('pending', 'paid')),
  add constraint orders_shipping_payment_choice_pair_check
    check ((shipping_fee_payer is null) = (shipping_payment_method is null));

comment on column public.orders.shipping_payment_status is
  'pending until a trusted cash receipt or a verified payment-provider callback confirms the shipping fee; never infer paid from order creation or a customer redirect.';

-- Keep guest order creation atomic: contacts, addresses, order, goods and guest
-- ownership are created by one database function in the same transaction.
create or replace function public.create_guest_order(p_payload jsonb)
returns table(order_id uuid, tracking_code text, actor_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor constant uuid := 'e5ce953a-4162-4600-9ea4-708442af6839';
  v_sender uuid;
  v_receiver uuid;
  v_pickup uuid;
  v_delivery uuid;
  v_order uuid;
  v_status uuid;
  v_fee_payer text := p_payload ->> 'shippingFeePayer';
  v_payment_method text := p_payload ->> 'shippingPaymentMethod';
begin
  if not exists (select 1 from public.users where id = v_actor) then
    raise exception 'Guest order actor missing';
  end if;
  if nullif(trim(p_payload #>> '{receiver,email}'), '') is null then
    raise exception 'Recipient email required';
  end if;
  if v_fee_payer is null or v_fee_payer not in ('sender', 'receiver') or v_payment_method is distinct from 'cash' then
    raise exception 'Unsupported shipping payment choice';
  end if;
  select id into v_status from public.order_statuses where code = 'CREATED';
  if v_status is null then raise exception 'Order status seed missing'; end if;

  insert into public.contacts(user_id, type, name, phone, email)
  values (null, 'sender', p_payload #>> '{sender,name}', p_payload #>> '{sender,phone}', p_payload ->> 'email')
  returning id into v_sender;
  insert into public.contacts(user_id, type, name, phone, email)
  values (null, 'receiver', p_payload #>> '{receiver,name}', p_payload #>> '{receiver,phone}',
          lower(trim(p_payload #>> '{receiver,email}')))
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
      delivery_warehouse_id, service_type, cod_amount, total_fee,
      shipping_fee_payer, shipping_payment_method, shipping_payment_status,
      note, status_id, created_by)
  values (p_payload ->> 'trackingCode', p_payload ->> 'trackingCode', v_sender, v_receiver,
      v_pickup, v_delivery, (p_payload ->> 'pickupWarehouseId')::uuid,
      (p_payload ->> 'deliveryWarehouseId')::uuid, p_payload ->> 'serviceType',
      (p_payload ->> 'codAmount')::numeric, (p_payload ->> 'totalFee')::numeric,
      v_fee_payer, v_payment_method, 'pending',
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
