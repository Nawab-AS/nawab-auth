import { json } from '@sveltejs/kit';
import { verifyAccessToken } from '$lib/server/oidc';
import { readFormOrJsonBody } from '$lib/server/http';
import { getCorsHeaders, handleCorsPreFlight } from '$lib/server/cors';

export const OPTIONS = async ({ request }) => {
	const origin = request.headers.get('origin');
	return handleCorsPreFlight(origin);
};

export const POST = async ({ request }) => {
	const corsHeaders = getCorsHeaders(request.headers.get('origin'));
	const responseHeaders = { 'cache-control': 'no-store', ...corsHeaders };

	const body = await readFormOrJsonBody(request);

	const token = String(body.token ?? '').trim();
	if (!token) {
		return json({ active: false }, { headers: responseHeaders });
	}

	try {
		const payload = await verifyAccessToken(token);
		return json(
			{
				active: true,
				sub: payload.sub,
				scope: payload.scope,
				client_id: payload.client_id,
				token_type: 'Bearer',
				iat: payload.iat,
				exp: payload.exp,
				nbf: payload.nbf,
				iss: payload.iss,
				aud: payload.aud
			},
			{ headers: responseHeaders }
		);
	} catch {
		return json({ active: false }, { headers: responseHeaders });
	}
};
