-- Tighten user_accounts RLS to prevent non-admin quota tampering.

begin;

-- Non-admin users should not be able to self-assign quotas.
-- They may only create their own account row with safe defaults.
drop policy if exists user_accounts_insert_own_or_admin on public.user_accounts;
create policy user_accounts_insert_own_or_admin
on public.user_accounts
for insert
to authenticated
with check (
  public.is_current_user_admin()
  or (
    auth.uid() = user_id
    and allowed_usage_usd <= 0.001
    and usage_carried_forward_usd = 0
    and coalesce(api_key_disabled, false) = false
  )
);

-- Non-admin users may update only API key state fields on their own row.
-- Quota fields must remain unchanged unless the actor is admin.
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
  )
);

commit;
