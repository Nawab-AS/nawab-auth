import { env } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';
import {
	appendQueryParams,
	buildConsentSummary,
	createAuthorizationCode,
	getOidcClientId,
	isAllowedRedirectUri,
	parseScopes,
	type SupportedScope
} from '$lib/server/oidc';
import {
	getOidcApiKeyGateState,
	getUserSsoState,
	markOnboardingVideoWatched,
	provisionApiKeyForFirstSso,
	getUserPreferredName
} from '$lib/server/account';
import { getAccessTokenFromCookies, getSupabaseUserFromCookies } from '$lib/server/supabase';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const VIDEO_GATE_COOKIE_NAME = 'oidc_video_gate';
const VIDEO_GATE_MAX_AGE_SECONDS = 30 * 60;
const VIDEO_GATE_MIN_WATCH_SECONDS = 20;

interface VideoGatePayload {
	userId: string;
	clientId: string;
	issuedAt: number;
	nonce: string;
}

const DENY_REASON_VALUES = ['user_denied', 'unverified_account'] as const;
type DenyReason = (typeof DENY_REASON_VALUES)[number];

function toDenyReason(value: string): DenyReason {
	return (DENY_REASON_VALUES as readonly string[]).includes(value)
		? (value as DenyReason)
		: 'user_denied';
}

function getDenyErrorDescription(reason: DenyReason): string {
	if (reason === 'unverified_account') {
		return 'could_not_login_unverified_account';
	}

	return 'could_not_login_user_denied';
}

function getVideoGateSecret(): string {
	const candidates = [
		env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
		env.OIDC_PRIVATE_JWK?.trim(),
		env.OIDC_CLIENT_SECRET?.trim(),
		env.OPENROUTER_MANAGEMENT_API_KEY?.trim()
	];

	const secret = candidates.find((value) => Boolean(value));
	if (!secret) {
		throw error(
			500,
			'Missing server secret required for onboarding video verification. Configure SUPABASE_SERVICE_ROLE_KEY or OIDC_CLIENT_SECRET.'
		);
	}

	return secret;
}

function getMinWatchSeconds(): number {
	const raw = Number(env.OIDC_VIDEO_MIN_WATCH_SECONDS ?? VIDEO_GATE_MIN_WATCH_SECONDS);
	if (!Number.isFinite(raw) || raw < 1) {
		return VIDEO_GATE_MIN_WATCH_SECONDS;
	}

	return Math.floor(raw);
}

function toBase64Url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
	const decoded = atob(`${normalized}${padding}`);
	return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

async function signVideoGatePayload(encodedPayload: string): Promise<string> {
	const secret = getVideoGateSecret();
	const key = await crypto.subtle.importKey(
		'raw',
		textEncoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(encodedPayload));
	return toBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}

	let mismatch = 0;
	for (let i = 0; i < a.length; i += 1) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}

	return mismatch === 0;
}

async function createVideoGateCookieValue(payload: VideoGatePayload): Promise<string> {
	const encodedPayload = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
	const signature = await signVideoGatePayload(encodedPayload);
	return `${encodedPayload}.${signature}`;
}

async function validateVideoGateCookie(input: {
	cookieValue: string;
	userId: string;
	clientId: string;
}): Promise<boolean> {
	const parts = input.cookieValue.split('.');
	if (parts.length !== 2) {
		return false;
	}

	const [encodedPayload, signature] = parts;
	if (!encodedPayload || !signature) {
		return false;
	}

	const expectedSignature = await signVideoGatePayload(encodedPayload);
	if (!timingSafeEqual(signature, expectedSignature)) {
		return false;
	}

	let payload: VideoGatePayload;
	try {
		payload = JSON.parse(textDecoder.decode(fromBase64Url(encodedPayload))) as VideoGatePayload;
	} catch {
		return false;
	}

	if (
		typeof payload.userId !== 'string' ||
		typeof payload.clientId !== 'string' ||
		typeof payload.nonce !== 'string' ||
		typeof payload.issuedAt !== 'number'
	) {
		return false;
	}

	if (payload.userId !== input.userId || payload.clientId !== input.clientId) {
		return false;
	}

	const now = Math.floor(Date.now() / 1000);
	const ageSeconds = now - payload.issuedAt;
	if (ageSeconds < getMinWatchSeconds()) {
		return false;
	}

	if (ageSeconds > VIDEO_GATE_MAX_AGE_SECONDS || ageSeconds < -10) {
		return false;
	}

	return true;
}

export const load = async ({ url, cookies }) => {
	const clientId = url.searchParams.get('client_id')?.trim() ?? '';
	const redirectUri =
		url.searchParams.get('redirect_uri')?.trim() ??
		url.searchParams.get('redirect_url')?.trim() ??
		'';
	const responseType = url.searchParams.get('response_type')?.trim() ?? '';
	const scope = parseScopes(url.searchParams.get('scope'));
	const state = url.searchParams.get('state')?.trim() ?? '';
	const nonce = url.searchParams.get('nonce')?.trim() ?? '';
	const codeChallenge = url.searchParams.get('code_challenge')?.trim() ?? '';
	const codeChallengeMethod = url.searchParams.get('code_challenge_method')?.trim() ?? '';

	if (clientId !== getOidcClientId()) {
		throw error(400, 'Unknown client_id');
	}

	if (!isAllowedRedirectUri(redirectUri)) {
		throw error(400, 'redirect_uri is not allowed');
	}

	if (responseType !== 'code') {
		throw error(400, 'Only authorization code flow is supported');
	}

	if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
		throw error(400, 'PKCE must use S256');
	}

	const user = await getSupabaseUserFromCookies(cookies);
	if (!user) {
		throw redirect(303, `/login?redirect_to=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
	}

	const accessToken = getAccessTokenFromCookies(cookies);
	if (!accessToken) {
		throw redirect(303, `/login?redirect_to=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
	}

	const ssoState = await getUserSsoState(user.id, accessToken);
	const gateState = await getOidcApiKeyGateState(user.id, accessToken);
	if (!gateState.canProceedToOidc) {
		throw redirect(303, `/login?redirect_to=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
	}

	const requiresVideoGate = !ssoState.firstSsoCompleted && !ssoState.videoWatched;
	if (requiresVideoGate) {
		const gateCookieValue = await createVideoGateCookieValue({
			userId: user.id,
			clientId,
			issuedAt: Math.floor(Date.now() / 1000),
			nonce: crypto.randomUUID()
		});

		cookies.set(VIDEO_GATE_COOKIE_NAME, gateCookieValue, {
			path: '/oauth/authorize',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: VIDEO_GATE_MAX_AGE_SECONDS
		});
	} else {
		cookies.delete(VIDEO_GATE_COOKIE_NAME, { path: '/oauth/authorize' });
	}


	return {
		user,
		ssoState,
		clientId,
		redirectUri,
		scopes: scope,
		state,
		nonce,
		codeChallenge,
		consent: buildConsentSummary({
			clientId,
			redirectUri,
			scopes: scope as SupportedScope[],
			codeChallenge,
			nonce
		})
	};
};

export const actions = {
	approve: async ({ request, url, cookies }) => {
		const formData = await request.formData();
		const redirectUri = String(
			formData.get('redirect_uri') ??
				formData.get('redirect_url') ??
				url.searchParams.get('redirect_uri') ??
				url.searchParams.get('redirect_url') ??
				''
		).trim();
		const state = String(formData.get('state') ?? url.searchParams.get('state') ?? '').trim();
		const clientId = String(formData.get('client_id') ?? url.searchParams.get('client_id') ?? '').trim();
		const scopes = parseScopes(String(formData.get('scope') ?? url.searchParams.get('scope') ?? 'openid'));
		const codeChallenge = String(formData.get('code_challenge') ?? url.searchParams.get('code_challenge') ?? '').trim();
		const nonce = String(formData.get('nonce') ?? url.searchParams.get('nonce') ?? '').trim() || undefined;
		const user = await getSupabaseUserFromCookies(cookies);
		const watchedVideo = String(formData.get('watched_video') ?? '').trim() === 'true';

		if (!isAllowedRedirectUri(redirectUri)) {
			throw error(400, 'redirect_uri is not allowed');
		}

		if (!state) {
			throw error(400, 'Missing state');
		}

		if (clientId !== getOidcClientId()) {
			throw error(400, 'Unknown client_id');
		}

		if (!user) {
			throw redirect(303, `/login?redirect_to=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
		}

		const accessToken = getAccessTokenFromCookies(cookies);
		if (!accessToken) {
			throw redirect(303, `/login?redirect_to=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
		}

		const ssoState = await getUserSsoState(user.id, accessToken);
		const gateState = await getOidcApiKeyGateState(user.id, accessToken);
		if (!gateState.canProceedToOidc) {
			throw error(403, 'An active API key is required before OIDC consent can be approved.');
		}

		if (!ssoState.isVerified) {
			throw error(403, 'Your account is not verified yet. An admin must verify your account before SSO use.');
		}

		if (!ssoState.firstSsoCompleted && !ssoState.videoWatched && !watchedVideo) {
			throw error(400, 'Watch the video first before approving SSO for the first time.');
		}

		if (!ssoState.firstSsoCompleted && !ssoState.videoWatched) {
			const gateCookieValue = cookies.get(VIDEO_GATE_COOKIE_NAME) ?? '';
			const validVideoGate = watchedVideo
				? await validateVideoGateCookie({
						cookieValue: gateCookieValue,
						userId: user.id,
						clientId
					})
				: false;

			if (!validVideoGate) {
				throw error(400, 'Watch the onboarding video before approving SSO.');
			}

			await markOnboardingVideoWatched(user.id, accessToken);
			cookies.delete(VIDEO_GATE_COOKIE_NAME, { path: '/oauth/authorize' });
		}

		if (ssoState.videoWatched || ssoState.firstSsoCompleted) {
			cookies.delete(VIDEO_GATE_COOKIE_NAME, { path: '/oauth/authorize' });
		}

		if (!ssoState.firstSsoCompleted) {
			await provisionApiKeyForFirstSso(user.id, accessToken);
		}

		// OIDC names must come only from user_profiles.preferred_name.
		const preferredName = await getUserPreferredName(user.id, accessToken);

		const code = await createAuthorizationCode({
			identity: {
				id: user.id,
				email: user.email,
				emailVerified: user.emailVerified,
				name: preferredName,
				preferredUsername: preferredName
			},
			clientId,
			redirectUri,
			scopes: scopes as SupportedScope[],
			nonce,
			codeChallenge
		});

		throw redirect(303, appendQueryParams(redirectUri, { code, state }));
	},
	deny: async ({ request, url }) => {
		const formData = await request.formData();
		const redirectUri = String(
			formData.get('redirect_uri') ??
				formData.get('redirect_url') ??
				url.searchParams.get('redirect_uri') ??
				url.searchParams.get('redirect_url') ??
				''
		).trim();
		const state = String(formData.get('state') ?? url.searchParams.get('state') ?? '').trim();
		const denyReason = toDenyReason(String(formData.get('deny_reason') ?? '').trim().toLowerCase());

		if (!isAllowedRedirectUri(redirectUri)) {
			throw error(400, 'redirect_uri is not allowed');
		}

		if (!state) {
			throw error(400, 'Missing state');
		}

		throw redirect(
			303,
			appendQueryParams(redirectUri, {
				error: 'access_denied',
				error_description: getDenyErrorDescription(denyReason),
				login_status: 'could_not_login',
				deny_reason: denyReason,
				state
			})
		);
	}
};
