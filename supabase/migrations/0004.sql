-- Remove plaintext API key storage and keep only hashed identifiers plus metadata.

begin;

drop policy if exists user_accounts_insert_own_or_admin on public.user_accounts;

alter table public.user_accounts
	drop column if exists api_key_secret;

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
		and api_key_fingerprint is null
	)
);

commit;