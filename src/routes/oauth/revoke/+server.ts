import { json } from '@sveltejs/kit';
import { revokeToken } from '$lib/server/oidc';
import { readFormOrJsonBody } from '$lib/server/http';
import { getCorsHeaders, handleCorsPreFlight } from '$lib/server/cors';

/**
 * Disable CSRF protection for OAuth revoke endpoint
 * OAuth endpoints handle cross-origin requests intentionally
 * and use OAuth tokens for authentication, not cookies
 */
export const config = {
	csrf: false
};

export const OPTIONS = async ({ request }) => {
	const origin = request.headers.get('origin');
	return handleCorsPreFlight(origin);
};

export const POST = async ({ request }) => {
	const corsHeaders = getCorsHeaders(request.headers.get('origin'));

	const body = await readFormOrJsonBody(request);

	const token = String(body.token ?? '').trim();
	if (!token) {
		return json(
			{ error: 'invalid_request', error_description: 'token is required.' },
			{ status: 400, headers: { 'cache-control': 'no-store', ...corsHeaders } }
		);
	}

	try {
		await revokeToken(token);
	} catch {
		// Intentionally return 200 per RFC 7009 semantics.
	}

	return new Response(null, { status: 200, headers: { 'cache-control': 'no-store', ...corsHeaders } });
};
