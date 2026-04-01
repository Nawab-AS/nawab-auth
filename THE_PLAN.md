# THE_PLAN

## Goal
Build a lightweight, edge-compatible OIDC provider using SvelteKit + Supabase for LibreChat SSO (via Auth.js custom provider), with OpenRouter key distribution for one service and dashboards for users/admin.

## Updated Constraints (Latest Decisions)
1. All users are English-only.
2. No user profile pictures are used or stored.
3. Supabase handles all authentication flows, including MFA.
4. Supabase user ID is the single canonical identity (`sub`) across all linked providers.
5. Key rolling is admin-controlled and deletes the old key immediately.

## Architecture
1. Frontend + API: SvelteKit on edge runtime.
2. Identity/Auth: Supabase Auth (email OTP + external providers + MFA).
3. OIDC Provider Surface: SvelteKit routes (discovery, authorization, token, userinfo, JWKS) backed by Supabase session/user data.
4. Data: Supabase Postgres with RLS.
5. Provider plugin: `@better-auth/oidc-provider` used where useful, with manual OIDC routes where necessary (`.well-known`, consent, token exchange details).

## Identity and Linking Model
1. User logs in with any allowed method (email OTP, Google, GitHub, Discord) through Supabase.
2. Supabase links identities and returns one user ID.
3. That Supabase user ID is always used as OIDC `sub`.
4. OIDC claims are minimal: `sub`, `email`, `email_verified`, `name`.
5. No `picture` claim is required.

## OIDC Endpoints (Minimum)
1. `GET /.well-known/openid-configuration`
2. `GET /.well-known/jwks.json`
3. `GET /oauth/authorize` (or equivalent provider route)
4. `POST /oauth/token`
5. `GET /oauth/userinfo`

Optional later:
1. `POST /oauth/revoke`
2. `POST /oauth/introspect`

## Key Management and Credit Limiting
1. Each user gets one active OpenRouter key for the single supported service.
2. Usage is tracked in an immutable usage ledger table.
3. On key roll:
   - Admin triggers roll from admin dashboard.
   - Old key is deleted immediately.
   - New key is created/assigned.
   - Historical usage remains in DB ledger (not in old key state).
4. Remaining credit is computed from DB usage totals, not from old-key persistence.
5. Budget checks are enforced server-side before allowing continued usage.

## Data Model (Core Tables)
1. `users`
   - `id` (Supabase Auth UUID, canonical)
   - `email`, `email_verified_at`, `display_name`, `admin` (boolean)
2. `oidc_authorizations`
   - consent records per client/scope/user
3. `oidc_sessions`
   - state, nonce, PKCE challenge, expiry
4. `openrouter_keys`
   - active key metadata only (old key rows may be hard-deleted on roll)
5. `openrouter_usage_ledger`
   - immutable per-request usage/cost records
6. `credit_limits`
   - total allowance and policy settings
7. `audit_logs`
   - auth events, consent events, admin key rolls, limit changes

## Dashboards
1. User dashboard:
   - Current usage
   - Remaining credits
   - Basic account info (English UI only)
2. Admin dashboard:
   - Set/update user credit limits
   - Roll user keys (immediate delete + reissue)
   - Disable user access
   - View audit trail and cohort summary

## Security and Edge Requirements
1. Edge-safe code only (no Node built-ins on edge paths).
2. Strict redirect URI allowlist for OAuth clients.
3. Enforce `state`, `nonce`, and PKCE S256.
4. Short-lived auth codes and access tokens.
5. Signed JWTs with JWKS publication.
6. HttpOnly/Secure cookies and CSRF protections on interactive endpoints.
7. Supabase RLS to isolate user data and gate admin operations.
8. Rate limiting for OTP and token endpoints.

## Phased Execution
1. Foundation
   - SvelteKit edge setup, Supabase project, schema + RLS.
2. Auth + Linking
   - Supabase auth providers + MFA and stable user mapping.
3. OIDC Layer
   - Discovery/JWKS/authorize/token/userinfo + consent screen.
4. OpenRouter Governance
   - Provisioning, usage ledger ingestion, remaining-credit logic.
5. Admin Controls
   - Admin-only key rolling (immediate deletion), budget tools, audit screens.
6. Hardening + Integration
   - LibreChat integration tests and security validation.

## Acceptance Checks
1. Login via any enabled provider always maps to one Supabase user ID.
2. LibreChat can complete OIDC auth code flow with PKCE.
3. User dashboard credit math matches ledger totals.
4. Admin key roll deletes old key immediately and preserves historical usage accounting.
5. Non-admin users cannot access admin routes/actions.
