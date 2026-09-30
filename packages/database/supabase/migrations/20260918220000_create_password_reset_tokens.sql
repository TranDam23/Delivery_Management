-- Store password-reset token hashes; raw reset tokens are never persisted.
create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_password_reset_tokens_user_id on password_reset_tokens (user_id);
create index idx_password_reset_tokens_expires_at on password_reset_tokens (expires_at);
create unique index idx_password_reset_tokens_token_hash on password_reset_tokens (token_hash);

alter table password_reset_tokens enable row level security;
