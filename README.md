# Nawab Auth

Edge-first OIDC provider for LibreChat, built with SvelteKit + Supabase.

This project is intended to act as a custom Auth.js-compatible identity provider and token broker flow for a single service setup.

## Current Status

- Implemented: dark minimal UI shell, Supabase OTP login and OAuth provider linking, OIDC discovery/JWKS, authorization code flow with PKCE, token endpoint, userinfo endpoint, revoke endpoint, introspection endpoint.
- Implemented: canonical user identity sourced from Supabase user ID (`sub`).
- Implemented: verification-first account lifecycle with unified user state (`unverified`, `verified`, `admin`, `banned`).
- Implemented: first-time SSO onboarding gate (video-required consent), automatic first-use OpenRouter key provisioning through OpenRouter management keys, dashboard fingerprint + usage stats, and admin usage-limit control.
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
- `OIDC_ALLOW_PUBLIC_TOKEN_CLIENT`
- `OIDC_REDIRECT_URIS`
- `ALLOWED_ORIGINS`
- `SUPPORT_EMAIL`

Optional for verification email delivery:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Optional for OTP email domain restrictions:

- `OTP_ALLOWED_EMAIL_DOMAINS`

Required for OpenRouter key provisioning and rotation:

- `OPENROUTER_MANAGEMENT_API_KEY`

Required for OpenRouter webhook verification:

- `OPENROUTER_WEBHOOK_SIGNATURE`

Optional for OpenRouter webhook browser-origin allowlist:

- `OPENROUTER_WEBHOOK_ALLOWED_ORIGINS` (default: `https://openrouter.ai`)

In the OpenRouter dashboard, go to observability > webhooks
> URL: <host>/webhooks/openrouter
> Method: POST
> Headers: {"x-webhook-signature": <OPENROUTER_WEBHOOK_SIGNATURE>}

Recommended for stable OIDC tokens across restarts:

- `OIDC_PRIVATE_JWK` (JSON string containing an RSA private JWK with `kid`)

If `OIDC_PRIVATE_JWK` is missing, the app generates an ephemeral signing key at runtime, which invalidates existing tokens after restart.

If your OIDC client is public and does not send a client secret to `/oauth/token`, set `OIDC_ALLOW_PUBLIC_TOKEN_CLIENT=true`. This is useful for PKCE-based clients such as LibreChat when token exchange happens without client authentication.

### OTP Email Domain Allowlist

Use `OTP_ALLOWED_EMAIL_DOMAINS` to restrict OTP login to specific email domains.

- Format: comma-separated domain names (without `@`)
- Example: `OTP_ALLOWED_EMAIL_DOMAINS=gmail.com,yahoo.com,outlook.com,hotmail.com,icloud.com`
- If unset or empty, OTP login allows all email domains

### CORS Configuration for OAuth Endpoints

OAuth API routes use a centralized origin allowlist configured with `ALLOWED_ORIGINS`.

- Format: comma-separated browser origins (scheme + host + optional port)
- Example (local): `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173`
- Example (production): `ALLOWED_ORIGINS=https://chat.example.com`

When an incoming request `Origin` matches the allowlist, OAuth routes return CORS headers and handle preflight `OPTIONS` requests. If not matched, browser cross-origin calls are blocked.

### Token Endpoint Authentication

By default, the token endpoint expects client authentication when `OIDC_CLIENT_SECRET` is configured.

- Confidential client: set `OIDC_CLIENT_SECRET` and leave `OIDC_ALLOW_PUBLIC_TOKEN_CLIENT=false`
- Public PKCE client: set `OIDC_ALLOW_PUBLIC_TOKEN_CLIENT=true`
- If `OIDC_CLIENT_SECRET` is empty, the client is treated as public

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
	- OpenRouter management hash: `user_accounts.api_key_hash`
	- public identifier: `user_accounts.api_key_fingerprint`
- First-time provisioned usage limit is tracked in `user_accounts.provisioned_usage_limit_usd`.
- Provisioned limit is calculated from allowed usage minus carried-forward usage at first SSO approval.
- Key provisioning and rolling use `OPENROUTER_MANAGEMENT_API_KEY` to create a real OpenRouter key, store the returned secret in `api_key_secret`, and keep the OpenRouter hash in `api_key_hash` so the previous key can be deleted on the next roll.
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
- Set `ALLOWED_ORIGINS` to your client app origin(s), for example: `https://chat.example.com`.
- If LibreChat is exchanging auth codes without a client secret, set `OIDC_ALLOW_PUBLIC_TOKEN_CLIENT=true`.
- If verification emails are enabled, configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in production.
- If OpenRouter key provisioning is enabled, configure `OPENROUTER_MANAGEMENT_API_KEY` in production.
- Set the onboarding video in `/static/onboarding.mp4`
## Roadmap (Next)

- Persist OIDC authorization codes and token revocations in Supabase.
- Add automated verification email templates and delivery monitoring.
