-- Set a non-zero initial allowed usage for newly created user accounts.

begin;

alter table public.user_accounts
	alter column allowed_usage_usd set default 0.0001;

drop policy if exists user_accounts_insert_own_or_admin on public.user_accounts;
create policy user_accounts_insert_own_or_admin
on public.user_accounts
for insert
to authenticated
with check (
	public.is_current_user_admin()
	or (
		auth.uid() = user_id
		and allowed_usage_usd = 0.0001
		and usage_carried_forward_usd = 0
		and provisioned_usage_limit_usd = 0
		and coalesce(api_key_disabled, false) = false
		and api_key_hash is null
		and api_key_fingerprint is null
	)
);

commit;
