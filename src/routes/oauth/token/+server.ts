import { json } from '@sveltejs/kit';
import {
	consumeAuthorizationCode,
	allowPublicTokenClient,
	getOidcClientId,
	getOidcClientSecret,
	issueTokenSet,
	verifyRefreshToken
} from '$lib/server/oidc';
import { readFormOrJsonBody } from '$lib/server/http';
import { getNoStoreCorsHeaders, handleCorsPreFlight } from '$lib/server/cors';

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

export const OPTIONS = async ({ request }) => {
	const origin = request.headers.get('origin');
	return handleCorsPreFlight(origin);
};

export const POST = async ({ request }) => {
	const body = await readFormOrJsonBody(request);
	const basicAuthorization = request.headers.get('authorization') ?? '';
	const responseHeaders = getNoStoreCorsHeaders(request.headers.get('origin'));
	const tokenJsonError = (error: string, errorDescription: string, status: number) =>
		json(
			{ error, error_description: errorDescription },
			{ status, headers: responseHeaders }
		);
	const clientSecretConfigured = Boolean(getOidcClientSecret());
	const clientAuthProvided = basicAuthorization.toLowerCase().startsWith('basic ')
		|| Boolean(String(body.client_secret ?? '').trim());

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
			return tokenJsonError('invalid_client', 'Malformed basic authorization credentials.', 401);
		}
	}

	const grantType = String(body.grant_type ?? '').trim();
	const expectedClientId = getOidcClientId();
	const bodyClientId = String(body.client_id ?? '').trim();
	const bodyClientSecret = String(body.client_secret ?? '').trim();
	const clientId = basicClientId || bodyClientId || expectedClientId;
	const providedClientSecret = basicClientSecret || bodyClientSecret;

	if (clientId !== expectedClientId) {
		return tokenJsonError('invalid_client', 'Unknown client_id.', 401);
	}

	if (clientSecretConfigured && clientAuthProvided && providedClientSecret !== getOidcClientSecret()) {
		return tokenJsonError('invalid_client', 'Invalid client authentication.', 401);
	}

	if (clientSecretConfigured && !clientAuthProvided && !allowPublicTokenClient()) {
		return tokenJsonError('invalid_client', 'Client authentication is required.', 401);
	}

	if (grantType === 'authorization_code') {
		const code = String(body.code ?? '').trim();
		const redirectUri = String(body.redirect_uri ?? '').trim();
		const codeVerifier = String(body.code_verifier ?? '').trim();

		if (!code || !redirectUri) {
			return tokenJsonError('invalid_request', 'code and redirect_uri are required.', 400);
		}

		try {
			const claims = await consumeAuthorizationCode({
				code,
				clientId,
				redirectUri,
				codeVerifier: codeVerifier || undefined
			});

			const tokenSet = await issueTokenSet({ claims, clientId });
			return json(toTokenResponse(tokenSet), { headers: responseHeaders });
		} catch (tokenIssueError) {
			return tokenJsonError('invalid_grant', (tokenIssueError as Error).message, 400);
		}
	}

	if (grantType === 'refresh_token') {
		const refreshToken = String(body.refresh_token ?? '').trim();
		if (!refreshToken) {
			return tokenJsonError('invalid_request', 'refresh_token is required.', 400);
		}

		try {
			const claims = await verifyRefreshToken(refreshToken, clientId);
			const tokenSet = await issueTokenSet({ claims, clientId });
			return json(toTokenResponse(tokenSet), { headers: responseHeaders });
		} catch (refreshError) {
			return tokenJsonError('invalid_grant', (refreshError as Error).message, 400);
		}
	}

	return tokenJsonError(
		'unsupported_grant_type',
		'Supported grant types: authorization_code, refresh_token',
		400
	);
};
