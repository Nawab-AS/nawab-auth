import { json } from '@sveltejs/kit';
import {
	consumeAuthorizationCode,
	getLibreChatClientId,
	issueTokenSet,
	verifyRefreshToken
} from '$lib/server/oidc';

export const POST = async ({ request }) => {
	const contentType = request.headers.get('content-type') ?? '';
	const isForm = contentType.includes('application/x-www-form-urlencoded');
	const body = isForm
		? Object.fromEntries((await request.formData()).entries())
		: ((await request.json()) as Record<string, unknown>);

	const grantType = String(body.grant_type ?? '').trim();
	const clientId = String(body.client_id ?? '').trim() || getLibreChatClientId();

	if (clientId !== getLibreChatClientId()) {
		return json(
			{ error: 'invalid_client', error_description: 'Unknown client_id.' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}

	if (grantType === 'authorization_code') {
		const code = String(body.code ?? '').trim();
		const redirectUri = String(body.redirect_uri ?? '').trim();
		const codeVerifier = String(body.code_verifier ?? '').trim();

		if (!code || !redirectUri || !codeVerifier) {
			return json(
				{ error: 'invalid_request', error_description: 'code, redirect_uri, and code_verifier are required.' },
				{ status: 400, headers: { 'cache-control': 'no-store' } }
			);
		}

		try {
			const claims = await consumeAuthorizationCode({
				code,
				clientId,
				redirectUri,
				codeVerifier
			});

			const tokenSet = await issueTokenSet({ claims, clientId });
			return json(
				{
					access_token: tokenSet.accessToken,
					token_type: 'Bearer',
					expires_in: tokenSet.expiresIn,
					scope: tokenSet.scope,
					id_token: tokenSet.idToken,
					refresh_token: tokenSet.refreshToken
				},
				{ headers: { 'cache-control': 'no-store' } }
			);
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
			return json(
				{
					access_token: tokenSet.accessToken,
					token_type: 'Bearer',
					expires_in: tokenSet.expiresIn,
					scope: tokenSet.scope,
					id_token: tokenSet.idToken,
					refresh_token: tokenSet.refreshToken
				},
				{ headers: { 'cache-control': 'no-store' } }
			);
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
