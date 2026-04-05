-- Enable Data API access for authenticated users via explicit grants + RLS policies.

-- Function used by policies to allow admin-level access checks.
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select up.is_admin
      from public.user_profiles up
      where up.user_id = auth.uid()
      limit 1
    ),
    false
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

-- Ensure authenticated users can reach the tables (RLS still governs rows).
grant select, insert, update on table public.user_profiles to authenticated;
grant select, insert, update on table public.user_accounts to authenticated;

-- user_profiles policies
alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select_own_or_admin on public.user_profiles;
create policy user_profiles_select_own_or_admin
on public.user_profiles
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_current_user_admin()
);

drop policy if exists user_profiles_insert_own_or_admin on public.user_profiles;
create policy user_profiles_insert_own_or_admin
on public.user_profiles
for insert
to authenticated
with check (
  public.is_current_user_admin()
  or (
    auth.uid() = user_id
    and is_admin = false
    and banned = false
  )
);

drop policy if exists user_profiles_update_own_or_admin on public.user_profiles;
create policy user_profiles_update_own_or_admin
on public.user_profiles
for update
to authenticated
using (
  public.is_current_user_admin()
  or (
    auth.uid() = user_id
    and is_admin = false
    and banned = false
  )
)
with check (
  public.is_current_user_admin()
  or (
    auth.uid() = user_id
    and is_admin = false
    and banned = false
  )
);

-- user_accounts policies
alter table public.user_accounts enable row level security;

drop policy if exists user_accounts_select_own_or_admin on public.user_accounts;
create policy user_accounts_select_own_or_admin
on public.user_accounts
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_current_user_admin()
);

drop policy if exists user_accounts_insert_own_or_admin on public.user_accounts;
create policy user_accounts_insert_own_or_admin
on public.user_accounts
for insert
to authenticated
with check (
  auth.uid() = user_id
  or public.is_current_user_admin()
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
  auth.uid() = user_id
  or public.is_current_user_admin()
);
