# Nawab Auth

Edge-first OIDC provider for LibreChat, built with SvelteKit + Supabase.

This project is intended to act as a custom Auth.js-compatible identity provider and token broker flow for a single service setup.

## Current Status

- Implemented: dark minimal UI shell, Supabase OTP login and OAuth provider linking, OIDC discovery/JWKS, authorization code flow with PKCE, token endpoint, userinfo endpoint, revoke endpoint, introspection endpoint.
- Implemented: canonical user identity sourced from Supabase user ID (`sub`).
- Implemented: verification-first account lifecycle with unified user state (`unverified`, `verified`, `admin`, `banned`).
- Implemented: first-time SSO onboarding gate (video-required consent), automatic first-use OpenRouter key provisioning, dashboard fingerprint + usage stats, and admin usage-limit control.
- Implemented: edge-safe verification email scaffold via HTTP mail API.
- Not yet complete: persistent token/code/revocation storage in DB (currently in-memory runtime sets), OpenRouter API-side limit synchronization call, and one-time cleartext key reveal UX.

## Tech Stack

- SvelteKit 2 + Svelte 5
- Adapter: `@sveltejs/adapter-vercel`
- Supabase: `@supabase/supabase-js`
- OIDC JWT/JWK handling: `jose`
- Better Auth package integration (config level): `@better-auth/oauth-provider`

## Requirements

- Node.js 20+
- npm
- Supabase project with Auth enabled

## Quick Start

1. Install dependencies:

```sh
npm install
```

2. Create env file from template:

```sh
cp .env.example .env
```

3. Fill in `.env` values.

4. Run development server:

```sh
npm run dev
```

5. Run checks:

```sh
npm run check
npm run lint
```

## Environment Variables

See `.env.example` for the full template.

Required for local development:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OIDC_ISSUER_URL`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_REDIRECT_URIS`
- `SUPPORT_EMAIL`

Optional for verification email delivery:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Recommended for stable OIDC tokens across restarts:

- `OIDC_PRIVATE_JWK` (JSON string containing an RSA private JWK with `kid`)

If `OIDC_PRIVATE_JWK` is missing, the app generates an ephemeral signing key at runtime, which invalidates existing tokens after restart.

## OIDC Endpoints

- Discovery: `/.well-known/openid-configuration`
- JWKS: `/.well-known/jwks.json`
- Authorize: `/oauth/authorize`
- Token: `/oauth/token`
- UserInfo: `/oauth/userinfo`
- Revoke: `/oauth/revoke`
- Introspect: `/oauth/introspect`

## OIDC Flow (Implemented)

1. Client redirects user to `/oauth/authorize` with PKCE parameters.
2. If user is not authenticated, user is redirected to `/login`.
3. Consent screen is always shown for each Login with OIDC request.
4. Unverified users are blocked from approval until an admin verifies their account.
5. On first SSO use, users must finish the setup video gate before approval is enabled.
6. First successful SSO approval provisions an OpenRouter API key if one does not already exist.
7. After consent approval, server returns authorization code to redirect_uri.
8. Client exchanges code at /oauth/token with code_verifier.
9. Server returns access_token, id_token, and optionally refresh_token (when offline_access is granted).
10. Client calls /oauth/userinfo with bearer access token.

## Auth Notes

- Supabase is the source of truth for user identity.
- `sub` claim in issued tokens is Supabase user ID.
- Account state now lives in `user_profiles.user_state` (`unverified`, `verified`, `admin`, `banned`).
- New users are created as `unverified` and cannot use SSO key provisioning until admin verification.
- OAuth provider linking and OTP verification are available from dashboard/login flows.
- MFA and social providers should be configured in Supabase and then exposed via the login UI.

## OpenRouter Provisioning Notes

- User keys are stored as:
	- secret value: `user_accounts.api_key_secret`
	- hash: `user_accounts.api_key_hash`
	- public identifier: `user_accounts.api_key_fingerprint`
- First-time provisioned usage limit is tracked in `user_accounts.provisioned_usage_limit_usd`.
- Provisioned limit is calculated from allowed usage minus carried-forward usage at first SSO approval.
- Admins can manually set per-user allowed usage in the admin dashboard.

## Security Notes

- PKCE `S256` required on authorize flow.
- One-time auth code enforcement is currently in memory.
- Revocation list is currently in memory.
- For production, move auth-code tracking + revocation state to persistent storage.

## Scripts

- `npm run dev` - Vite dev server on port 5173
- `npm run dev:host` - Dev server exposed on host network
- `npm run build` - Production build
- `npm run preview` - Local Vercel dev preview on port 5173
- `npm run check` - Type and Svelte checks
- `npm run lint` - ESLint

## Deployment

- Target runtime is Vercel Edge-compatible architecture.
- Keep runtime code edge-safe: avoid Node built-ins in edge paths.
- Configure production env vars in Vercel project settings.
- If verification emails are enabled, configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in production.

## Roadmap (Next)

- Persist OIDC authorization codes and token revocations in Supabase.
- Add explicit OpenRouter API-side limit synchronization during provisioning/roll.
- Add one-time cleartext key reveal and recovery UX for end users.
- Add automated verification email templates and delivery monitoring.
