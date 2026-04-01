import { error, redirect } from '@sveltejs/kit';
import {
	appendQueryParams,
	buildConsentSummary,
	createAuthorizationCode,
	getLibreChatClientId,
	isAllowedRedirectUri,
	parseScopes,
	type SupportedScope
} from '$lib/server/oidc';
import { getSupabaseUserFromCookies } from '$lib/server/supabase';

export const load = async ({ url, cookies }) => {
	const clientId = url.searchParams.get('client_id')?.trim() ?? '';
	const redirectUri = url.searchParams.get('redirect_uri')?.trim() ?? '';
	const responseType = url.searchParams.get('response_type')?.trim() ?? '';
	const scope = parseScopes(url.searchParams.get('scope'));
	const state = url.searchParams.get('state')?.trim() ?? '';
	const nonce = url.searchParams.get('nonce')?.trim() ?? '';
	const codeChallenge = url.searchParams.get('code_challenge')?.trim() ?? '';
	const codeChallengeMethod = url.searchParams.get('code_challenge_method')?.trim() ?? '';

	if (clientId !== getLibreChatClientId()) {
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

	if (!codeChallenge) {
		throw error(400, 'PKCE code_challenge is required');
	}

	const user = await getSupabaseUserFromCookies(cookies);
	if (!user) {
		throw redirect(303, `/login?return_to=${encodeURIComponent(url.toString())}`);
	}

	return {
		user,
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
		const redirectUri = String(formData.get('redirect_uri') ?? url.searchParams.get('redirect_uri') ?? '').trim();
		const state = String(formData.get('state') ?? url.searchParams.get('state') ?? '').trim();
		const clientId = url.searchParams.get('client_id')?.trim() ?? '';
		const scopes = parseScopes(url.searchParams.get('scope'));
		const codeChallenge = url.searchParams.get('code_challenge')?.trim() ?? '';
		const nonce = url.searchParams.get('nonce')?.trim() ?? undefined;
		const user = await getSupabaseUserFromCookies(cookies);

		if (!isAllowedRedirectUri(redirectUri)) {
			throw error(400, 'redirect_uri is not allowed');
		}

		if (!state) {
			throw error(400, 'Missing state');
		}

		if (clientId !== getLibreChatClientId()) {
			throw error(400, 'Unknown client_id');
		}

		if (!codeChallenge) {
			throw error(400, 'Missing code_challenge');
		}

		if (!user) {
			throw redirect(303, `/login?return_to=${encodeURIComponent(url.toString())}`);
		}

		const code = await createAuthorizationCode({
			identity: {
				id: user.id,
				email: user.email,
				emailVerified: user.emailVerified,
				name: user.name
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
		const redirectUri = String(formData.get('redirect_uri') ?? url.searchParams.get('redirect_uri') ?? '').trim();
		const state = String(formData.get('state') ?? url.searchParams.get('state') ?? '').trim();

		if (!isAllowedRedirectUri(redirectUri)) {
			throw error(400, 'redirect_uri is not allowed');
		}

		if (!state) {
			throw error(400, 'Missing state');
		}

		throw redirect(303, appendQueryParams(redirectUri, { error: 'access_denied', state }));
	}
};
