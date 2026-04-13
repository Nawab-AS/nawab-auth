import { env } from '$env/dynamic/private';
import { importJWK, exportJWK, generateKeyPair, SignJWT, jwtVerify, calculateJwkThumbprint } from 'jose';
import type { JWK, JWTPayload } from 'jose';
import type { OAuthOptions } from '@better-auth/oauth-provider';
import type { SupabaseSessionUser } from '$lib/server/supabase';
import { getDashboardSnapshot } from '$lib/server/account';

type SigningKey = CryptoKey | Uint8Array;

export const supportedScopes = ['openid', 'profile', 'email', 'offline_access'] as const;

export type SupportedScope = (typeof supportedScopes)[number];
export type OidcClientId = string;
export type KeyRollRole = 'user' | 'admin';

export interface ConsentSummary {
	clientId: OidcClientId;
	redirectUri: string;
	scopes: SupportedScope[];
	sharedClaims: Array<'name' | 'email'>;
	hasPkce: boolean;
	hasNonce: boolean;
}

export interface DashboardSnapshot {
	userId: string;
	email: string;
	emailVerified: boolean;
	locale: 'en';
	isAdmin: boolean;
	isVerified: boolean;
	userState: 'unverified' | 'verified' | 'admin' | 'banned';
	preferredName: string | null;
	allowedUsageUsd: number;
	usageCarriedForwardUsd: number;
	currentUsageUsd: number;
	apiKeyFingerprint: string | null;
	apiKeyAssigned: boolean;
	apiKeyDisabled: boolean;
	rolledKeyIds: string[];
}

export interface SessionIdentity {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string;
	preferredUsername: string;
}

interface AuthorizationCodePayload {
	sub: string;
	email: string;
	email_verified: boolean;
	name: string;
	preferred_username: string;
	client_id: string;
	redirect_uri: string;
	scope: string;
	nonce?: string;
	code_challenge?: string;
	code_challenge_method?: 'S256';
}

interface TokenClaims {
	sub: string;
	email: string;
	emailVerified: boolean;
	name: string;
	preferredUsername: string;
	clientId: string;
	scope: string;
	nonce?: string;
}

interface SigningContext {
	publicJwk: JWK;
	publicKey: SigningKey;
	privateKey: SigningKey;
	kid: string;
}

const OIDC_ALG = 'RS256';
const oneTimeCodeUse = new Set<string>();
const revokedTokenIds = new Set<string>();
let signingContextPromise: Promise<SigningContext> | null = null;

const PRIVATE_JWK_FIELDS = new Set(['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']);

export const betterOAuthProviderConfig: OAuthOptions = {
	scopes: [...supportedScopes],
	loginPage: '/login',
	consentPage: '/oauth/authorize',
	grantTypes: ['authorization_code', 'refresh_token'],
	advertisedMetadata: {
		scopes_supported: [...supportedScopes],
		claims_supported: ['sub', 'email', 'email_verified', 'name', 'preferred_username']
	}
};

function trimTrailingSlash(value: string) {
	return value.trim().replace(/\/+$/, '');
}

function toAbsoluteUrl(base: string, path: string) {
	return `${trimTrailingSlash(base)}${path}`;
}

function getRequiredEnv(name: keyof typeof env) {
	const value = env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

export function getIssuer() {
	return trimTrailingSlash(getRequiredEnv('OIDC_ISSUER_URL'));
}

export function getOidcClientId(): OidcClientId {
	return getRequiredEnv('OIDC_CLIENT_ID');
}

export function getOidcClientSecret() {
	return env.OIDC_CLIENT_SECRET?.trim() ?? '';
}

export function allowPublicTokenClient() {
	return (env.OIDC_ALLOW_PUBLIC_TOKEN_CLIENT ?? '').trim().toLowerCase() === 'true';
}

export function getAllowedRedirectUris() {
	const rawValues = getRequiredEnv('OIDC_REDIRECT_URIS').split(',');

	const parsed = rawValues
		.map((value) => trimTrailingSlash(value))
		.filter(Boolean)
		.filter((value) => toRedirectBaseUri(value) !== null);

	if (parsed.length === 0) {
		throw new Error('OIDC_REDIRECT_URIS must include at least one valid absolute URI.');
	}

	return parsed;
}

function toRedirectBaseUri(value: string) {
	try {
		const parsed = new URL(value.trim());
		return trimTrailingSlash(`${parsed.origin}${parsed.pathname}`);
	} catch {
		return null;
	}
}

export function isAllowedRedirectUri(redirectUri: string) {
	const requestedBaseUri = toRedirectBaseUri(redirectUri);
	if (!requestedBaseUri) {
		return false;
	}

	return getAllowedRedirectUris().some((allowedRedirectUri) => toRedirectBaseUri(allowedRedirectUri) === requestedBaseUri);
}

export function parseScopes(scope: string | null) {
	const requestedScopes = (scope ?? 'openid').split(/\s+/).map((value) => value.trim()).filter(Boolean);
	const acceptedScopes = requestedScopes.filter((value): value is SupportedScope =>
		(supportedScopes as readonly string[]).includes(value)
	);

	return acceptedScopes.length > 0 ? acceptedScopes : ['openid'];
}

export function buildDiscoveryDocument() {
	const issuer = getIssuer();
	const tokenAuthMethods = getOidcClientSecret()
		? allowPublicTokenClient()
			? ['client_secret_basic', 'client_secret_post', 'none']
			: ['client_secret_basic', 'client_secret_post']
		: ['none'];

	return {
		issuer,
		authorization_endpoint: toAbsoluteUrl(issuer, '/oauth/authorize'),
		token_endpoint: toAbsoluteUrl(issuer, '/oauth/token'),
		userinfo_endpoint: toAbsoluteUrl(issuer, '/oauth/userinfo'),
		jwks_uri: toAbsoluteUrl(issuer, '/.well-known/jwks.json'),
		response_types_supported: ['code'],
		subject_types_supported: ['public'],
		id_token_signing_alg_values_supported: [OIDC_ALG],
		scopes_supported: [...supportedScopes],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		token_endpoint_auth_methods_supported: tokenAuthMethods,
		claims_supported: ['sub', 'email', 'email_verified', 'name', 'preferred_username'],
		code_challenge_methods_supported: ['S256']
	};
}

async function createSigningContextFromEnv(): Promise<SigningContext | null> {
	const maybePrivate = env.OIDC_PRIVATE_JWK?.trim();
	if (!maybePrivate) {
		return null;
	}

	const privateJwk = JSON.parse(maybePrivate) as JWK;
	const privateKey = await importJWK(privateJwk, OIDC_ALG);
	const publicJwk = Object.fromEntries(
		Object.entries(privateJwk).filter(([field]) => !PRIVATE_JWK_FIELDS.has(field))
	) as JWK;
	const publicKey = await importJWK(publicJwk, OIDC_ALG);
	const kid = privateJwk.kid ?? (await calculateJwkThumbprint(publicJwk));

	return {
		publicJwk,
		publicKey,
		privateKey,
		kid
	};
}

async function createEphemeralSigningContext(): Promise<SigningContext> {
	const pair = await generateKeyPair(OIDC_ALG);
	const publicJwk = await exportJWK(pair.publicKey);
	const kid = await calculateJwkThumbprint(publicJwk);

	return {
		publicJwk,
		publicKey: pair.publicKey,
		privateKey: pair.privateKey,
		kid
	};
}

async function getSigningContext(): Promise<SigningContext> {
	if (!signingContextPromise) {
		signingContextPromise = (async () => {
			const fromEnv = await createSigningContextFromEnv();
			if (fromEnv) {
				return fromEnv;
			}

			return createEphemeralSigningContext();
		})();
	}

	return signingContextPromise;
}

function toBase64Url(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

async function s256(codeVerifier: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
	return toBase64Url(new Uint8Array(digest));
}

export async function buildJwksDocument() {
	const signing = await getSigningContext();
	return {
		keys: [{ ...signing.publicJwk, kid: signing.kid, alg: OIDC_ALG, use: 'sig' }]
	};
}

export function buildConsentSummary(params: {
	clientId: OidcClientId;
	redirectUri: string;
	scopes: SupportedScope[];
	codeChallenge?: string | null;
	nonce?: string | null;
}): ConsentSummary {
	return {
		clientId: params.clientId,
		redirectUri: params.redirectUri,
		scopes: params.scopes,
		sharedClaims: ['name', 'email'],
		hasPkce: Boolean(params.codeChallenge),
		hasNonce: Boolean(params.nonce)
	};
}

export function appendQueryParams(baseUrl: string, params: Record<string, string>) {
	const url = new URL(baseUrl);

	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	return url.toString();
}

export function summarizeScopes(scopes: SupportedScope[]) {
	return scopes.map((scope) => scope.replace(/_/g, ' '));
}

export function createRollRequestId() {
	return `roll_${crypto.randomUUID().replace(/-/g, '')}`;
}

export async function createAuthorizationCode(input: {
	identity: SessionIdentity;
	clientId: string;
	redirectUri: string;
	scopes: SupportedScope[];
	nonce?: string;
	codeChallenge?: string;
}) {
	const signing = await getSigningContext();
	const issuer = getIssuer();
	const codeId = crypto.randomUUID();

	const jwt = await new SignJWT({
		sub: input.identity.id,
		email: input.identity.email,
		email_verified: input.identity.emailVerified,
		name: input.identity.name,
		preferred_username: input.identity.preferredUsername,
		client_id: input.clientId,
		redirect_uri: input.redirectUri,
		scope: input.scopes.join(' '),
		nonce: input.nonce,
		code_challenge: input.codeChallenge,
		code_challenge_method: input.codeChallenge ? 'S256' : undefined
	} as JWTPayload)
		.setProtectedHeader({ alg: OIDC_ALG, kid: signing.kid })
		.setIssuedAt()
		.setIssuer(issuer)
		.setAudience(input.clientId)
		.setExpirationTime('10m')
		.setJti(codeId)
		.sign(signing.privateKey);

	return jwt;
}

export async function consumeAuthorizationCode(input: {
	code: string;
	clientId: string;
	redirectUri: string;
	codeVerifier?: string;
}) {
	const signing = await getSigningContext();
	const issuer = getIssuer();

	const verified = await jwtVerify(input.code, signing.publicKey, {
		issuer,
		audience: input.clientId,
		algorithms: [OIDC_ALG]
	});

	const payload = verified.payload as unknown as AuthorizationCodePayload;
	if (payload.client_id !== input.clientId) {
		throw new Error('Invalid client_id in authorization code.');
	}

	if (payload.redirect_uri !== input.redirectUri) {
		throw new Error('Invalid redirect_uri in authorization code.');
	}

	const jti = verified.payload.jti;
	if (!jti) {
		throw new Error('Missing code identifier.');
	}

	if (oneTimeCodeUse.has(jti)) {
		throw new Error('Authorization code already used.');
	}

	if (payload.code_challenge) {
		if (payload.code_challenge_method !== 'S256') {
			throw new Error('Only S256 PKCE is supported.');
		}

		if (!input.codeVerifier) {
			throw new Error('Missing code_verifier for PKCE-protected authorization code.');
		}

		const computed = await s256(input.codeVerifier);
		if (computed !== payload.code_challenge) {
			throw new Error('Invalid code_verifier for PKCE.');
		}
	}

	oneTimeCodeUse.add(jti);

	return {
		sub: payload.sub,
		email: payload.email,
		emailVerified: payload.email_verified,
		name: payload.name,
		preferredUsername: payload.preferred_username,
		scope: payload.scope,
		nonce: payload.nonce,
		clientId: input.clientId
	} satisfies TokenClaims;
}

async function signToken(payload: Record<string, unknown>, options: { audience: string; expiresIn: string; tokenId: string }) {
	const signing = await getSigningContext();
	const issuer = getIssuer();

	return new SignJWT(payload)
		.setProtectedHeader({ alg: OIDC_ALG, kid: signing.kid })
		.setIssuer(issuer)
		.setAudience(options.audience)
		.setIssuedAt()
		.setExpirationTime(options.expiresIn)
		.setJti(options.tokenId)
		.sign(signing.privateKey);
}

export async function issueTokenSet(input: { claims: TokenClaims; clientId: string }) {
	const scopeArray = parseScopes(input.claims.scope);
	const scope = scopeArray.join(' ');
	const accessTokenId = crypto.randomUUID();
	const refreshTokenId = crypto.randomUUID();

	const accessToken = await signToken(
		{
			sub: input.claims.sub,
			email: input.claims.email,
			email_verified: input.claims.emailVerified,
			name: input.claims.name,
			preferred_username: input.claims.preferredUsername,
			scope,
			client_id: input.clientId,
			token_use: 'access'
		},
		{ audience: `${getIssuer()}/oauth/userinfo`, expiresIn: '1h', tokenId: accessTokenId }
	);

	const idToken = await signToken(
		{
			sub: input.claims.sub,
			email: input.claims.email,
			email_verified: input.claims.emailVerified,
			name: input.claims.name,
			preferred_username: input.claims.preferredUsername,
			nonce: input.claims.nonce,
			token_use: 'id'
		},
		{ audience: input.clientId, expiresIn: '1h', tokenId: crypto.randomUUID() }
	);

	const refreshToken = scopeArray.includes('offline_access')
		? await signToken(
				{
					sub: input.claims.sub,
					email: input.claims.email,
					email_verified: input.claims.emailVerified,
					name: input.claims.name,
					preferred_username: input.claims.preferredUsername,
					scope,
					client_id: input.clientId,
					token_use: 'refresh'
				},
				{ audience: input.clientId, expiresIn: '30d', tokenId: refreshTokenId }
			)
		: null;

	return {
		accessToken,
		idToken,
		refreshToken,
		expiresIn: 3600,
		scope
	};
}

export async function verifyRefreshToken(refreshToken: string, clientId: string): Promise<TokenClaims> {
	const signing = await getSigningContext();
	const issuer = getIssuer();
	const verified = await jwtVerify(refreshToken, signing.publicKey, {
		issuer,
		audience: clientId,
		algorithms: [OIDC_ALG]
	});

	if (verified.payload.token_use !== 'refresh') {
		throw new Error('Token is not a refresh token.');
	}

	if (verified.payload.jti && revokedTokenIds.has(verified.payload.jti)) {
		throw new Error('Refresh token has been revoked.');
	}

	return {
		sub: String(verified.payload.sub ?? ''),
		email: String(verified.payload.email ?? ''),
		emailVerified: Boolean(verified.payload.email_verified),
		name: String(verified.payload.name ?? ''),
		preferredUsername: String(verified.payload.preferred_username ?? ''),
		clientId,
		scope: String(verified.payload.scope ?? 'openid'),
		nonce: undefined
	};
}

export async function verifyAccessToken(accessToken: string) {
	const signing = await getSigningContext();
	const issuer = getIssuer();
	const verified = await jwtVerify(accessToken, signing.publicKey, {
		issuer,
		audience: `${getIssuer()}/oauth/userinfo`,
		algorithms: [OIDC_ALG]
	});

	if (verified.payload.token_use !== 'access') {
		throw new Error('Token is not an access token.');
	}

	if (verified.payload.jti && revokedTokenIds.has(verified.payload.jti)) {
		throw new Error('Access token has been revoked.');
	}

	return verified.payload;
}

export async function revokeToken(token: string) {
	const signing = await getSigningContext();
	const verified = await jwtVerify(token, signing.publicKey, {
		algorithms: [OIDC_ALG],
		issuer: getIssuer(),
		audience: [getOidcClientId(), `${getIssuer()}/oauth/userinfo`]
	});

	if (verified.payload.jti) {
		revokedTokenIds.add(verified.payload.jti);
	}
}

export async function buildDashboardSnapshot(
	user: SupabaseSessionUser,
	accessToken: string | null
): Promise<DashboardSnapshot> {
	return getDashboardSnapshot(user, accessToken);
}
