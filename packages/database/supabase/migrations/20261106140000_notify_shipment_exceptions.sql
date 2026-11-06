-- ============================================================================
-- Thong bao khi xu ly ngoai le van chuyen. Gui bang trigger tren shipment_exceptions
-- (cung ky thuat voi notification_center) nen khong the quen gui khi xu ly ngoai le.
--   - Nhan vien kho / dieu phoi vien cua kho bi anh huong
--   - Shipper cu khi bi doi nguoi phu trach (shipper moi da duoc thong bao boi trigger phan cong)
--   - Khach hang cua don (noi dung chung, khong lo ly do noi bo)
-- Nguoi thuc hien xu ly khong tu nhan thong bao.
-- ============================================================================

create or replace function public.notify_warehouse_people(
  p_order_id uuid, p_warehouse_id uuid, p_title text, p_message text, p_exclude uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_warehouse_id is null then return; end if;
  insert into public.notifications (user_id, order_id, type, title, message)
  select distinct u.id, p_order_id, 'system', p_title, p_message
  from public.users u
  join public.roles r on r.id = u.role_id
  left join public.warehouses w on w.id = p_warehouse_id
  where u.status = 'active'
    and u.id is distinct from p_exclude
    and (
      (r.code = 'WAREHOUSE_STAFF' and u.warehouse_id = p_warehouse_id)
      -- Dieu phoi vien cap tinh phu trach ca cac kho con, nen cung nhan thong bao cua kho con.
      or (r.code = 'DISPATCHER' and u.warehouse_id in (p_warehouse_id, w.parent_warehouse_id))
    );
end;
$$;
revoke all on function public.notify_warehouse_people(uuid, uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.notify_shipment_exception()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tracking text;
  v_leg public.shipment_legs%rowtype;
  v_ref text;
  v_old_staff uuid;
begin
  -- Thong bao khong duoc lam hong viec xu ly ngoai le: moi loi o day chi ghi canh bao.
  begin
  select tracking_code into v_tracking from public.orders where id = new.order_id;
  if v_tracking is null then return new; end if;
  v_ref := 'Đơn ' || v_tracking;

  if new.shipment_leg_id is not null then
    select * into v_leg from public.shipment_legs where id = new.shipment_leg_id;
  end if;

  if new.exception_type = 'WRONG_WAREHOUSE' then
    perform public.notify_warehouse_people(new.order_id, (new.details ->> 'actual_warehouse_id')::uuid,
      'Hàng nhập sai kho về kho của bạn',
      v_ref || ' được ghi nhận nhập tại kho của bạn do nhập sai kho; chuẩn bị xuất kho theo tuyến mới. Lý do: ' || new.reason,
      new.created_by);
    perform public.notify_warehouse_people(new.order_id, (new.details ->> 'expected_warehouse_id')::uuid,
      'Hàng không đến kho của bạn',
      v_ref || ' đã được nhập tại kho khác (nhập sai kho), không cần chờ hàng ở kho của bạn nữa.',
      new.created_by);
    perform public.notify_order_customers(new.order_id, 'Đơn hàng điều chỉnh tuyến',
      v_ref || ' được điều chỉnh tuyến vận chuyển, thời gian giao có thể thay đổi.', 'delivery_abnormal');

  elsif new.exception_type = 'WRONG_AREA' then
    perform public.notify_warehouse_people(new.order_id, (new.details ->> 'new_delivery_warehouse_id')::uuid,
      'Đơn được chuyển về kho giao của bạn',
      v_ref || ' được đổi sang kho giao của bạn do giao sai khu vực. Lý do: ' || new.reason,
      new.created_by);
    perform public.notify_warehouse_people(new.order_id, (new.details ->> 'old_delivery_warehouse_id')::uuid,
      'Đơn không còn giao từ kho của bạn',
      v_ref || ' đã được đổi sang kho giao khác do giao sai khu vực.',
      new.created_by);
    perform public.notify_warehouse_people(new.order_id, (new.details ->> 'replanned_from_warehouse_id')::uuid,
      'Tuyến của đơn đã thay đổi',
      v_ref || ' được lập lại tuyến từ kho của bạn do giao sai khu vực; xuất kho theo tuyến mới.',
      new.created_by);
    perform public.notify_order_customers(new.order_id, 'Đơn hàng điều chỉnh tuyến',
      v_ref || ' được điều chỉnh tuyến vận chuyển, thời gian giao có thể thay đổi.', 'delivery_abnormal');

  elsif new.exception_type = 'TRANSFER_FAILED' then
    perform public.notify_warehouse_people(new.order_id, v_leg.from_warehouse_id,
      'Chuyển kho thất bại, cần xuất lại',
      v_ref || ' chuyển kho thất bại và quay về chờ xuất kho (lần ' || coalesce(v_leg.attempt_no::text, '?') || '). Lý do: ' || new.reason,
      new.created_by);
    perform public.notify_warehouse_people(new.order_id, v_leg.to_warehouse_id,
      'Chuyến chuyển kho thất bại',
      v_ref || ' chuyển đến kho của bạn thất bại, hàng chưa đến; sẽ có chuyến xuất lại.',
      new.created_by);
    perform public.notify_order_customers(new.order_id, 'Đơn hàng bị chậm',
      v_ref || ' gặp sự cố khi chuyển kho và sẽ được vận chuyển lại, thời gian giao có thể thay đổi.', 'delivery_abnormal');

  elsif new.exception_type = 'REASSIGNED' then
    v_old_staff := (new.details ->> 'from_staff_id')::uuid;
    if v_old_staff is not null and v_old_staff is distinct from new.created_by then
      insert into public.notifications (user_id, order_id, type, title, message)
      select u.id, new.order_id, 'system', 'Nhiệm vụ được giao cho người khác',
             v_ref || ' đã được điều phối giao cho nhân viên khác. Bạn không còn phụ trách chặng này.'
      from public.users u where u.id = v_old_staff and u.status = 'active';
    end if;
  end if;
  exception when others then
    raise warning 'notify_shipment_exception failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_shipment_exception on public.shipment_exceptions;
create trigger trg_notify_shipment_exception
  after insert on public.shipment_exceptions
  for each row execute function public.notify_shipment_exception();
