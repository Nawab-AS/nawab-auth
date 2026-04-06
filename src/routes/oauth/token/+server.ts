import { json } from '@sveltejs/kit';
import {
	consumeAuthorizationCode,
	getOidcClientId,
	getOidcClientSecret,
	issueTokenSet,
	verifyRefreshToken
} from '$lib/server/oidc';
import { readFormOrJsonBody } from '$lib/server/http';

function toTokenResponse(tokenSet: {
	accessToken: string;
	idToken: string;
	refreshToken: string | null;
	expiresIn: number;
	scope: string;
}) {
	const response: Record<string, string | number> = {
		access_token: tokenSet.accessToken,
		token_type: 'Bearer',
		expires_in: tokenSet.expiresIn,
		scope: tokenSet.scope,
		id_token: tokenSet.idToken
	};

	if (tokenSet.refreshToken) {
		response.refresh_token = tokenSet.refreshToken;
	}

	return response;
}

export const POST = async ({ request }) => {
	const body = await readFormOrJsonBody(request);
	const basicAuthorization = request.headers.get('authorization') ?? '';

	let basicClientId = '';
	let basicClientSecret = '';

	if (basicAuthorization.toLowerCase().startsWith('basic ')) {
		try {
			const encoded = basicAuthorization.slice(6).trim();
			const decoded = atob(encoded);
			const separatorIndex = decoded.indexOf(':');

			if (separatorIndex >= 0) {
				basicClientId = decoded.slice(0, separatorIndex).trim();
				basicClientSecret = decoded.slice(separatorIndex + 1).trim();
			}
		} catch {
			return json(
				{ error: 'invalid_client', error_description: 'Malformed basic authorization credentials.' },
				{ status: 401, headers: { 'cache-control': 'no-store' } }
			);
		}
	}

	const grantType = String(body.grant_type ?? '').trim();
	const expectedClientId = getOidcClientId();
	const expectedClientSecret = getOidcClientSecret();
	const bodyClientId = String(body.client_id ?? '').trim();
	const bodyClientSecret = String(body.client_secret ?? '').trim();
	const clientId = basicClientId || bodyClientId || expectedClientId;
	const providedClientSecret = basicClientSecret || bodyClientSecret;

	if (clientId !== expectedClientId) {
		return json(
			{ error: 'invalid_client', error_description: 'Unknown client_id.' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}

	if (providedClientSecret !== expectedClientSecret) {
		return json(
			{ error: 'invalid_client', error_description: 'Invalid client authentication.' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}

	if (grantType === 'authorization_code') {
		const code = String(body.code ?? '').trim();
		const redirectUri = String(body.redirect_uri ?? '').trim();
		const codeVerifier = String(body.code_verifier ?? '').trim();

		if (!code || !redirectUri) {
			return json(
				{ error: 'invalid_request', error_description: 'code and redirect_uri are required.' },
				{ status: 400, headers: { 'cache-control': 'no-store' } }
			);
		}

		try {
			const claims = await consumeAuthorizationCode({
				code,
				clientId,
				redirectUri,
				codeVerifier: codeVerifier || undefined
			});

			const tokenSet = await issueTokenSet({ claims, clientId });
			return json(toTokenResponse(tokenSet), { headers: { 'cache-control': 'no-store' } });
		} catch (tokenError) {
			return json(
				{ error: 'invalid_grant', error_description: (tokenError as Error).message },
				{ status: 400, headers: { 'cache-control': 'no-store' } }
			);
		}
	}

	if (grantType === 'refresh_token') {
		const refreshToken = String(body.refresh_token ?? '').trim();
		if (!refreshToken) {
			return json(
				{ error: 'invalid_request', error_description: 'refresh_token is required.' },
				{ status: 400, headers: { 'cache-control': 'no-store' } }
			);
		}

		try {
			const claims = await verifyRefreshToken(refreshToken, clientId);
			const tokenSet = await issueTokenSet({ claims, clientId });
			return json(toTokenResponse(tokenSet), { headers: { 'cache-control': 'no-store' } });
		} catch (refreshError) {
			return json(
				{ error: 'invalid_grant', error_description: (refreshError as Error).message },
				{ status: 400, headers: { 'cache-control': 'no-store' } }
			);
		}
	}

	return json(
		{ error: 'unsupported_grant_type', error_description: 'Supported grant types: authorization_code, refresh_token' },
		{ status: 400, headers: { 'cache-control': 'no-store' } }
	);
};
