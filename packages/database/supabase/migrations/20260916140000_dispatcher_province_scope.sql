-- ============================================================================
-- Phạm vi điều phối theo tỉnh/thành phố
-- ============================================================================

alter table public.users
  add column if not exists province text;

comment on column public.users.province is
  'Tỉnh/thành phố phụ trách của tài khoản điều phối viên; để null với các role khác.';

create index if not exists idx_users_province on public.users (province);
