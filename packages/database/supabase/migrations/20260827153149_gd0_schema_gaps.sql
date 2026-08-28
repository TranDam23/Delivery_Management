-- ============================================================================
-- GĐ0 - Bổ sung các phần schema còn thiếu cho state machine, tracking,
-- Blockchain và cảnh báo bất thường.
-- ============================================================================

-- 1) Các trạng thái cần cho luồng phân công và giao lại.
insert into order_statuses (code, name, description, is_final)
values
  ('PENDING_ASSIGNMENT', 'Chờ phân công', 'Đơn đã tạo và đang chờ điều phối phân công nhân viên', false),
  ('ASSIGNED', 'Đã phân công', 'Đơn đã được phân công cho nhân viên giao hàng', false),
  ('REDELIVERY', 'Giao lại', 'Đơn được phép thực hiện lại sau một lần giao thất bại', false)
on conflict (code) do nothing;

-- 2) Ngày/giờ giao dự kiến phục vụ tracking và phát hiện đơn trễ hạn.
alter table orders
  add column if not exists expected_delivery_date timestamptz;

create index if not exists idx_orders_expected_delivery_date
  on orders (expected_delivery_date);

-- 3) Lưu trạng thái trước đó để dựng đầy đủ lịch sử chuyển trạng thái.
-- Nullable để migration không làm hỏng dữ liệu delivery_events cũ (nếu có).
alter table delivery_events
  add column if not exists from_status_id uuid references order_statuses (id);

create index if not exists idx_delivery_events_from_status_id
  on delivery_events (from_status_id);

-- 4) Metadata của giao dịch Blockchain bất đồng bộ.
-- performed_by là users.id trong DB; địa chỉ ví được ghi trên chain.
alter table blockchain_events
  add column if not exists performed_by uuid references users (id) on delete set null,
  add column if not exists chain_timestamp timestamptz,
  add column if not exists tx_status text not null default 'pending';

alter table blockchain_events
  drop constraint if exists blockchain_events_tx_status_check;

alter table blockchain_events
  add constraint blockchain_events_tx_status_check
  check (tx_status in ('pending', 'confirmed', 'failed'));

create index if not exists idx_blockchain_events_performed_by
  on blockchain_events (performed_by);

create index if not exists idx_blockchain_events_tx_status
  on blockchain_events (tx_status);

-- 5) Cảnh báo bất thường cần vòng đời xử lý riêng với notifications.
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders (id) on delete cascade,
  alert_type text not null,
  title text not null,
  message text not null,
  details jsonb,
  detected_at timestamptz not null default now(),
  status text not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint alerts_status_check
    check (status in ('open', 'acknowledged', 'resolved', 'dismissed'))
);

create index if not exists idx_alerts_order_id on alerts (order_id);
create index if not exists idx_alerts_status on alerts (status);
create index if not exists idx_alerts_detected_at on alerts (detected_at desc);

alter table alerts enable row level security;
