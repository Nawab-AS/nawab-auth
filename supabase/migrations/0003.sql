-- Unify profile state into user_state and add first-SSO/OpenRouter key metadata.

begin;

alter table public.user_profiles
	add column if not exists user_state text;

update public.user_profiles
set user_state = case
	when banned = true then 'banned'
	when is_admin = true then 'admin'
	else 'verified'
end
where user_state is null;

alter table public.user_profiles
	alter column user_state set default 'unverified';

alter table public.user_profiles
	alter column user_state set not null;

alter table public.user_profiles
	drop constraint if exists user_profiles_user_state_check;

alter table public.user_profiles
	add constraint user_profiles_user_state_check
	check (user_state in ('unverified', 'verified', 'admin', 'banned'));

alter table public.user_profiles
	add column if not exists first_sso_completed boolean not null default false,
	add column if not exists onboarding_video_watched boolean not null default false,
	add column if not exists verified_at timestamptz;

update public.user_profiles
set verified_at = coalesce(verified_at, now())
where user_state in ('verified', 'admin');

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select up.user_state = 'admin'
      from public.user_profiles up
      where up.user_id = auth.uid()
      limit 1
    ),
    false
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

drop policy if exists user_profiles_insert_own_or_admin on public.user_profiles;
create policy user_profiles_insert_own_or_admin
on public.user_profiles
for insert
to authenticated
with check (
  public.is_current_user_admin()
  or (
    auth.uid() = user_id
    and user_state = 'unverified'
  )
);

drop policy if exists user_profiles_update_own_or_admin on public.user_profiles;
create policy user_profiles_update_own_or_admin
on public.user_profiles
for update
to authenticated
using (
  public.is_current_user_admin()
  or auth.uid() = user_id
)
with check (
  public.is_current_user_admin()
  or (
    auth.uid() = user_id
    and user_state = (
      select existing.user_state
      from public.user_profiles as existing
      where existing.user_id = public.user_profiles.user_id
    )
  )
);

alter table public.user_accounts
	add column if not exists api_key_secret text,
  add column if not exists api_key_fingerprint text,
  add column if not exists provisioned_usage_limit_usd numeric not null default 0;

update public.user_accounts
set
	api_key_secret = api_key_hash,
	api_key_hash = md5(api_key_hash),
	api_key_fingerprint = substring(md5(api_key_hash) from 1 for 12)
where api_key_hash is not null
  and api_key_secret is null;

-- Keep non-admin insert defaults locked down for new key columns.
drop policy if exists user_accounts_insert_own_or_admin on public.user_accounts;
create policy user_accounts_insert_own_or_admin
on public.user_accounts
for insert
to authenticated
with check (
  public.is_current_user_admin()
  or (
    auth.uid() = user_id
    and allowed_usage_usd = 0
    and usage_carried_forward_usd = 0
    and provisioned_usage_limit_usd = 0
    and coalesce(api_key_disabled, false) = false
    and api_key_hash is null
    and api_key_secret is null
    and api_key_fingerprint is null
  )
);

drop policy if exists user_accounts_update_own_or_admin on public.user_accounts;
create policy user_accounts_update_own_or_admin
on public.user_accounts
for update
to authenticated
using (
  auth.uid() = user_id
  or public.is_current_user_admin()
)
with check (
  public.is_current_user_admin()
  or (
    auth.uid() = user_id
    and allowed_usage_usd = (
      select existing.allowed_usage_usd
      from public.user_accounts as existing
      where existing.user_id = public.user_accounts.user_id
    )
    and usage_carried_forward_usd = (
      select existing.usage_carried_forward_usd
      from public.user_accounts as existing
      where existing.user_id = public.user_accounts.user_id
    )
    and provisioned_usage_limit_usd = (
      select existing.provisioned_usage_limit_usd
      from public.user_accounts as existing
      where existing.user_id = public.user_accounts.user_id
    )
  )
);

commit;
