-- ============================================================================
-- Quan ly kho, trung chuyen va cac chang van chuyen.
-- Khong them role moi: Admin/Dispatcher quan ly dieu phoi, Delivery Staff
-- chi thao tac tren chang duoc phan cong.
-- ============================================================================

create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address_line text not null,
  ward text,
  district text,
  province text not null,
  capacity integer,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_capacity_check check (capacity is null or capacity >= 0),
  constraint warehouses_status_check check (status in ('active', 'inactive'))
);

create index if not exists idx_warehouses_province_district
  on warehouses (province, district);
create index if not exists idx_warehouses_status on warehouses (status);

create table if not exists shipment_legs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  sequence_no integer not null,
  leg_type text not null,
  from_warehouse_id uuid references warehouses (id) on delete set null,
  to_warehouse_id uuid references warehouses (id) on delete set null,
  assigned_staff_id uuid references users (id) on delete set null,
  assigned_by uuid references users (id) on delete set null,
  assigned_at timestamptz,
  status text not null default 'PENDING',
  started_at timestamptz,
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipment_legs_sequence_check check (sequence_no > 0),
  constraint shipment_legs_type_check check (leg_type in ('PICKUP', 'TRANSFER', 'LAST_MILE')),
  constraint shipment_legs_status_check check (status in ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED')),
  unique (order_id, sequence_no)
);

create index if not exists idx_shipment_legs_order_id on shipment_legs (order_id, sequence_no);
create index if not exists idx_shipment_legs_assigned_staff on shipment_legs (assigned_staff_id);
create index if not exists idx_shipment_legs_status on shipment_legs (status);

create table if not exists warehouse_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  shipment_leg_id uuid not null references shipment_legs (id) on delete cascade,
  warehouse_id uuid not null references warehouses (id),
  event_type text not null,
  performed_by uuid not null references users (id),
  event_time timestamptz not null default now(),
  note text,
  constraint warehouse_events_type_check check (event_type in ('INBOUND', 'OUTBOUND'))
);

create index if not exists idx_warehouse_events_order_id on warehouse_events (order_id, event_time);
create index if not exists idx_warehouse_events_leg_id on warehouse_events (shipment_leg_id, event_time);
create index if not exists idx_warehouse_events_warehouse_id on warehouse_events (warehouse_id, event_time);
create unique index if not exists idx_warehouse_events_unique_scan
  on warehouse_events (shipment_leg_id, warehouse_id, event_type);

-- Gan lien ket phan cong hien tai voi mot chang van chuyen.
alter table deliveries
  add column if not exists shipment_leg_id uuid references shipment_legs (id) on delete set null;

create unique index if not exists idx_deliveries_shipment_leg_id
  on deliveries (shipment_leg_id)
  where shipment_leg_id is not null;

create trigger trg_warehouses_updated_at
  before update on warehouses
  for each row execute function set_updated_at();

create trigger trg_shipment_legs_updated_at
  before update on shipment_legs
  for each row execute function set_updated_at();

alter table warehouses enable row level security;
alter table shipment_legs enable row level security;
alter table warehouse_events enable row level security;
