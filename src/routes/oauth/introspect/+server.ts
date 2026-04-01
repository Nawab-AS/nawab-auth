import { json } from '@sveltejs/kit';
import { verifyAccessToken } from '$lib/server/oidc';

export const POST = async ({ request }) => {
	const contentType = request.headers.get('content-type') ?? '';
	const isForm = contentType.includes('application/x-www-form-urlencoded');
	const body = isForm
		? Object.fromEntries((await request.formData()).entries())
		: ((await request.json()) as Record<string, unknown>);

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
