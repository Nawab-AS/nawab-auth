# Nawab Auth

Edge-first OIDC provider for LibreChat, built with SvelteKit + Supabase.

This project is intended to act as a custom Auth.js-compatible identity provider and token broker flow for a single service setup.

## Current Status

- Implemented: dark minimal UI shell, Supabase-backed login (email + password), OIDC discovery/JWKS, authorization code flow with PKCE, token endpoint, userinfo endpoint, revoke endpoint, introspection endpoint.
- Implemented: canonical user identity sourced from Supabase user ID (`sub`).
- Implemented: support scaffolding and types for `@better-auth/oauth-provider` configuration.
- Not yet complete: Supabase OTP/social auth UI wiring, persistent token/code/revocation storage in DB (currently in-memory runtime sets), production admin/user key-roll backend.

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
3. Consent screen is always shown for each `Login with OIDC` request.
4. Consent screen explicitly limits shared profile data to `name` and `email`.
5. After consent approval, server returns authorization `code` to `redirect_uri`.
6. Client exchanges `code` at `/oauth/token` with `code_verifier`.
7. Server returns `access_token`, `id_token`, and optionally `refresh_token` (when `offline_access` is granted).
8. Client calls `/oauth/userinfo` with bearer access token.

## Auth Notes

- Supabase is the source of truth for user identity.
- `sub` claim in issued tokens is Supabase user ID.
- Current login page uses email + password sign-in for bootstrap.
- MFA and social providers should be configured in Supabase and then connected to the login UI.

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

## Roadmap (Next)

- Replace password bootstrap UI with Supabase OTP + provider login options.
- Persist OIDC authorization codes and token revocations in Supabase.
- Implement full OpenRouter key lifecycle and usage dashboard persistence.
- Complete admin/user key roll operations with immediate key deletion policy and ledger carry-forward.
