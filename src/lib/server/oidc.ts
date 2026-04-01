import { env } from '$env/dynamic/private';

export const supportedScopes = ['openid', 'profile', 'email', 'offline_access'] as const;

export type SupportedScope = (typeof supportedScopes)[number];
export type OidcClientId = 'librechat';
export type KeyRollRole = 'user' | 'admin';

export interface ConsentSummary {
	clientId: OidcClientId;
	redirectUri: string;
	scopes: SupportedScope[];
	hasPkce: boolean;
	hasNonce: boolean;
}

export interface DashboardSnapshot {
	userId: string;
	email: string;
	emailVerified: boolean;
	locale: 'en';
	isAdmin: boolean;
	totalCreditsUsd: number;
	pastUsageUsd: number;
	currentUsageUsd: number;
	activeKeyId: string | null;
	rolledKeyIds: string[];
}

function trimTrailingSlash(value: string) {
	return value.trim().replace(/\/+$/, '');
}

function toAbsoluteUrl(base: string, path: string) {
	return `${trimTrailingSlash(base)}${path}`;
}

export function getIssuer() {
	return trimTrailingSlash(env.AUTH_ISSUER_URL ?? 'http://127.0.0.1:4173');
}

export function getLibreChatClientId(): OidcClientId {
	return (env.LIBRECHAT_CLIENT_ID?.trim() as OidcClientId | undefined) ?? 'librechat';
}

export function getAllowedRedirectUris() {
	const rawValues = env.LIBRECHAT_REDIRECT_URIS?.split(',') ?? ['http://localhost:3080/api/auth/callback/oidc'];

	return rawValues.map((value) => trimTrailingSlash(value)).filter(Boolean);
}

export function isAllowedRedirectUri(redirectUri: string) {
	return getAllowedRedirectUris().includes(trimTrailingSlash(redirectUri));
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

	return {
		issuer,
		authorization_endpoint: toAbsoluteUrl(issuer, '/oauth/authorize'),
		token_endpoint: toAbsoluteUrl(issuer, '/oauth/token'),
		userinfo_endpoint: toAbsoluteUrl(issuer, '/oauth/userinfo'),
		jwks_uri: toAbsoluteUrl(issuer, '/.well-known/jwks.json'),
		response_types_supported: ['code'],
		subject_types_supported: ['public'],
		id_token_signing_alg_values_supported: ['RS256'],
		scopes_supported: [...supportedScopes],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		token_endpoint_auth_methods_supported: ['none'],
		claims_supported: ['sub', 'email', 'email_verified', 'name'],
		code_challenge_methods_supported: ['S256']
	};
}

export function buildJwksDocument() {
	return { keys: [] as Array<Record<string, unknown>> };
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

export function buildDashboardSnapshot(): DashboardSnapshot {
	return {
		userId: 'supabase-user-id-placeholder',
		email: 'student@example.edu',
		emailVerified: true,
		locale: 'en',
		isAdmin: true,
		totalCreditsUsd: 15,
		pastUsageUsd: 4.25,
		currentUsageUsd: 1.75,
		activeKeyId: 'key_live_placeholder',
		rolledKeyIds: ['key_old_placeholder_1', 'key_old_placeholder_2']
	};
}
