-- Persist OIDC one-time authorization code use and revoked token IDs so that
-- replay protection and revocation hold across all serverless instances.
-- (Previously both lived in per-instance memory, so a replayed code or a
-- revoked token could be accepted by any other instance.)

begin;

create table if not exists public.oidc_one_time_codes (
	jti text primary key,
	used_at timestamptz not null default now()
);

create table if not exists public.oidc_revoked_tokens (
	jti text primary key,
	revoked_at timestamptz not null default now()
);

-- These tables are touched only with SUPABASE_SERVICE_ROLE_KEY (which bypasses
-- RLS), so no policies are created: anon/authenticated clients get
-- deny-by-default.
alter table public.oidc_one_time_codes enable row level security;
alter table public.oidc_revoked_tokens enable row level security;

-- Support pruning of rows whose code/token has expired (codes expire in
-- 10 minutes, access tokens in 1 hour, refresh tokens in 30 days).
create index if not exists oidc_one_time_codes_used_at_idx
	on public.oidc_one_time_codes (used_at);

create index if not exists oidc_revoked_tokens_revoked_at_idx
	on public.oidc_revoked_tokens (revoked_at);

commit;
