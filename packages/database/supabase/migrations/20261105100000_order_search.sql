create or replace function public.search_orders_page(
  p_visible_order_ids uuid[],
  p_status_code text,
  p_search text,
  p_page integer,
  p_page_size integer
)
returns table (order_id uuid, total_count bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_search_pattern text;
begin
  if p_page is null or p_page < 1 or p_page > 10000
    or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Invalid order page';
  end if;
  if p_search is not null and length(p_search) > 100 then
    raise exception 'Order search term is too long';
  end if;

  if p_search is not null and p_search <> '' then
    v_search_pattern := '%' || replace(replace(replace(p_search, '!', '!!'), '%', '!%'), '_', '!_') || '%';
  end if;

  return query
  with filtered as materialized (
    select o.id, o.created_at
      from public.orders as o
      join public.order_statuses as status on status.id = o.status_id
      left join public.contacts as sender on sender.id = o.sender_id
      left join public.contacts as receiver on receiver.id = o.receiver_id
     where (p_visible_order_ids is null or o.id = any(p_visible_order_ids))
       and (p_status_code is null or status.code = p_status_code)
       and (
         v_search_pattern is null
         or o.tracking_code ilike v_search_pattern escape '!'
         or sender.name ilike v_search_pattern escape '!'
         or sender.phone ilike v_search_pattern escape '!'
         or receiver.name ilike v_search_pattern escape '!'
         or receiver.phone ilike v_search_pattern escape '!'
       )
  ),
  page_rows as (
    select filtered.id, filtered.created_at
      from filtered
     order by filtered.created_at desc, filtered.id desc
     limit p_page_size
    offset (p_page - 1) * p_page_size
  ),
  totals as (
    select count(*) as total_count from filtered
  )
  select page_rows.id, totals.total_count
    from totals
    left join page_rows on true
   order by page_rows.created_at desc nulls last, page_rows.id desc;
end;
$$;

revoke all on function public.search_orders_page(uuid[], text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.search_orders_page(uuid[], text, text, integer, integer)
  to service_role;
