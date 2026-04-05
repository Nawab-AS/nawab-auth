import { json } from '@sveltejs/kit';
import { verifyAccessToken } from '$lib/server/oidc';
import { readFormOrJsonBody } from '$lib/server/http';

export const POST = async ({ request }) => {
	const body = await readFormOrJsonBody(request);

	const token = String(body.token ?? '').trim();
	if (!token) {
		return json({ active: false }, { headers: { 'cache-control': 'no-store' } });
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
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch {
		return json({ active: false }, { headers: { 'cache-control': 'no-store' } });
	}
};
