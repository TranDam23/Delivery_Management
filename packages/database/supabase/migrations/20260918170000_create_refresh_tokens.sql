-- Store refresh-token hashes so raw tokens are never persisted.
create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_refresh_tokens_user_id on refresh_tokens (user_id);
create index idx_refresh_tokens_expires_at on refresh_tokens (expires_at);
create unique index idx_refresh_tokens_token_hash on refresh_tokens (token_hash);

-- Keep refresh-token hashes inaccessible to anon/authenticated clients.
-- The server uses the service-role client, which bypasses RLS.
alter table refresh_tokens enable row level security;
