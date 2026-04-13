import { json } from '@sveltejs/kit';
import { verifyAccessToken } from '$lib/server/oidc';
import { getCorsHeaders, handleCorsPreFlight } from '$lib/server/cors';

export const OPTIONS = async ({ request }) => {
	const origin = request.headers.get('origin');
	return handleCorsPreFlight(origin);
};

export const GET = async ({ request }) => {
	const corsHeaders = getCorsHeaders(request.headers.get('origin'));

	const authorization = request.headers.get('authorization') ?? '';
	const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

	if (!token) {
		return json(
			{ error: 'invalid_token', error_description: 'Missing bearer token.' },
			{ status: 401, headers: { 'cache-control': 'no-store', ...corsHeaders } }
		);
	}

	try {
		const payload = await verifyAccessToken(token);
		return json(
			{
				sub: String(payload.sub ?? ''),
				email: String(payload.email ?? ''),
				email_verified: Boolean(payload.email_verified),
				name: String(payload.name ?? ''),
				preferred_username: String(payload.preferred_username ?? '')
			},
			{ headers: { 'cache-control': 'no-store', ...corsHeaders } }
		);
	} catch (accessError) {
		return json(
			{ error: 'invalid_token', error_description: (accessError as Error).message },
			{ status: 401, headers: { 'cache-control': 'no-store', ...corsHeaders } }
		);
	}
};
