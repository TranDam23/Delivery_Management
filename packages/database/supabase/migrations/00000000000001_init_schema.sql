-- ============================================================================
-- Delivery Management - Initial schema
-- He thong quan ly va xac thuc quy trinh giao nhan hang hoa ung dung Blockchain
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUM types
-- ----------------------------------------------------------------------------
create type contact_type as enum ('sender', 'receiver');
create type delivery_attempt_result as enum ('success', 'failed');
create type cod_transaction_status as enum ('pending', 'collected', 'reconciled');
create type user_status as enum ('active', 'inactive', 'suspended');

-- ----------------------------------------------------------------------------
-- roles / permissions / role_permissions
-- ----------------------------------------------------------------------------
create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  module text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles (id),
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  phone text,
  avatar text,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index idx_users_role_id on users (role_id);

-- ----------------------------------------------------------------------------
-- contacts / addresses (circular FK: contacts.default_address_id <-> addresses.contact_id)
-- ----------------------------------------------------------------------------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  type contact_type not null,
  name text not null,
  phone text not null,
  default_address_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  recipient_name text not null,
  phone text not null,
  address_line text not null,
  ward text,
  district text,
  province text,
  latitude double precision,
  longitude double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table contacts
  add constraint contacts_default_address_id_fkey
  foreign key (default_address_id) references addresses (id) on delete set null;

create index idx_contacts_user_id on contacts (user_id);
create index idx_addresses_contact_id on addresses (contact_id);

-- ----------------------------------------------------------------------------
-- order_statuses
-- ----------------------------------------------------------------------------
create table order_statuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_final boolean not null default false
);

-- ----------------------------------------------------------------------------
-- orders / order_items
-- ----------------------------------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  tracking_code text not null unique,
  qr_code text not null unique,
  sender_id uuid not null references contacts (id),
  receiver_id uuid not null references contacts (id),
  pickup_address_id uuid not null references addresses (id),
  delivery_address_id uuid not null references addresses (id),
  service_type text not null default 'standard',
  cod_amount numeric(14, 2) not null default 0,
  total_fee numeric(14, 2) not null default 0,
  status_id uuid not null references order_statuses (id),
  note text,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancel_reason text
);

create index idx_orders_sender_id on orders (sender_id);
create index idx_orders_receiver_id on orders (receiver_id);
create index idx_orders_status_id on orders (status_id);
create index idx_orders_created_by on orders (created_by);
create index idx_orders_created_at on orders (created_at desc);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  item_name text not null,
  item_type text,
  quantity integer not null default 1,
  weight numeric(10, 2),
  length numeric(10, 2),
  width numeric(10, 2),
  height numeric(10, 2),
  declared_value numeric(14, 2),
  note text
);

create index idx_order_items_order_id on order_items (order_id);

-- ----------------------------------------------------------------------------
-- deliveries / delivery_events / delivery_attempts
-- ----------------------------------------------------------------------------
create table deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  delivery_staff_id uuid not null references users (id),
  assigned_by uuid not null references users (id),
  assigned_at timestamptz not null default now(),
  received_at timestamptz,
  is_return boolean not null default false
);

create index idx_deliveries_order_id on deliveries (order_id);
create index idx_deliveries_delivery_staff_id on deliveries (delivery_staff_id);

create table delivery_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references deliveries (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  status_id uuid not null references order_statuses (id),
  performed_by uuid not null references users (id),
  event_time timestamptz not null default now(),
  location_lat double precision,
  location_lng double precision,
  note text,
  image_url text
);

create index idx_delivery_events_delivery_id on delivery_events (delivery_id);
create index idx_delivery_events_order_id on delivery_events (order_id);
create index idx_delivery_events_event_time on delivery_events (event_time desc);

create table delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references deliveries (id) on delete cascade,
  attempt_no integer not null default 1,
  attempt_time timestamptz not null default now(),
  result delivery_attempt_result not null,
  reason_fail text,
  note text
);

create index idx_delivery_attempts_delivery_id on delivery_attempts (delivery_id);

-- ----------------------------------------------------------------------------
-- cod_transactions
-- ----------------------------------------------------------------------------
create table cod_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  amount numeric(14, 2) not null,
  collected_by uuid references users (id),
  collected_at timestamptz,
  status cod_transaction_status not null default 'pending',
  reconciled_at timestamptz,
  reconciled_by uuid references users (id),
  note text
);

create index idx_cod_transactions_order_id on cod_transactions (order_id);
create index idx_cod_transactions_status on cod_transactions (status);

-- ----------------------------------------------------------------------------
-- blockchain_events
-- ----------------------------------------------------------------------------
create table blockchain_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  event_type text not null,
  event_data_hash text not null,
  previous_hash text,
  transaction_hash text,
  block_number bigint,
  created_at timestamptz not null default now()
);

create index idx_blockchain_events_order_id on blockchain_events (order_id);
create index idx_blockchain_events_tx_hash on blockchain_events (transaction_hash);

-- ----------------------------------------------------------------------------
-- notifications / audit_logs / system_settings
-- ----------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  order_id uuid references orders (id) on delete set null,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index idx_notifications_user_id on notifications (user_id);
create index idx_notifications_is_read on notifications (is_read);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index idx_audit_logs_user_id on audit_logs (user_id);

create table system_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text,
  description text,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at auto-update trigger
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_roles_updated_at before update on roles for each row execute function set_updated_at();
create trigger trg_permissions_updated_at before update on permissions for each row execute function set_updated_at();
create trigger trg_users_updated_at before update on users for each row execute function set_updated_at();
create trigger trg_contacts_updated_at before update on contacts for each row execute function set_updated_at();
create trigger trg_addresses_updated_at before update on addresses for each row execute function set_updated_at();
create trigger trg_orders_updated_at before update on orders for each row execute function set_updated_at();
create trigger trg_system_settings_updated_at before update on system_settings for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security (enabled by default; service_role bypasses RLS).
-- Backend (Next.js API routes) uses the service role key, so app-level
-- authorization is enforced there. These policies only need to cover any
-- direct client-side Supabase access (e.g. realtime subscriptions).
-- ----------------------------------------------------------------------------
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table users enable row level security;
alter table contacts enable row level security;
alter table addresses enable row level security;
alter table order_statuses enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table deliveries enable row level security;
alter table delivery_events enable row level security;
alter table delivery_attempts enable row level security;
alter table cod_transactions enable row level security;
alter table blockchain_events enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table system_settings enable row level security;

-- Authenticated users can read their own user row and notifications.
create policy "users_select_self" on users
  for select using (auth.uid() = id);

create policy "notifications_select_own" on notifications
  for select using (auth.uid() = user_id);

create policy "notifications_update_own" on notifications
  for update using (auth.uid() = user_id);

-- order_statuses is public reference data.
create policy "order_statuses_select_all" on order_statuses
  for select using (true);
