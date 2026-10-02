create function reset_password_with_token(
  p_token_hash text,
  p_password_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from password_reset_tokens
  where token_hash = p_token_hash
    and used_at is null
    and expires_at > clock_timestamp()
  for update;

  if v_user_id is null then
    return false;
  end if;

  perform 1
  from users
  where id = v_user_id
  for update;

  if not found then
    return false;
  end if;

  update password_reset_tokens
  set used_at = clock_timestamp()
  where token_hash = p_token_hash
    and user_id = v_user_id
    and used_at is null
    and expires_at > clock_timestamp();

  if not found then
    return false;
  end if;

  update users
  set password_hash = p_password_hash,
      updated_at = clock_timestamp()
  where id = v_user_id;

  update refresh_tokens
  set revoked_at = clock_timestamp()
  where user_id = v_user_id
    and revoked_at is null;

  return true;
end;
$$;

revoke all on function reset_password_with_token(text, text)
  from public, anon, authenticated;
grant execute on function reset_password_with_token(text, text)
  to service_role;
