-- Cho phép một chặng giao cuối được thực hiện lại sau khi giao thất bại,
-- nhưng vẫn giữ nguyên toàn bộ lịch sử nhập/xuất kho của các lần trước.

alter table shipment_legs
  add column if not exists attempt_no integer not null default 1;

alter table warehouse_events
  add column if not exists attempt_no integer not null default 1;

drop index if exists idx_warehouse_events_unique_scan;

create unique index if not exists idx_warehouse_events_unique_scan_attempt
  on warehouse_events (shipment_leg_id, warehouse_id, event_type, attempt_no);

create index if not exists idx_shipment_legs_attempt_no
  on shipment_legs (order_id, sequence_no, attempt_no);

insert into system_settings (key, value, description)
values (
  'MAX_DELIVERY_ATTEMPTS',
  '3',
  'Số lần giao tối đa trước khi chuyển đơn sang quy trình hoàn hàng'
)
on conflict (key) do nothing;
