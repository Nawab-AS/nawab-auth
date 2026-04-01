import { json } from '@sveltejs/kit';
import { verifyAccessToken } from '$lib/server/oidc';

export const GET = async ({ request }) => {
	const authorization = request.headers.get('authorization') ?? '';
	const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

	if (!token) {
		return json(
			{ error: 'invalid_token', error_description: 'Missing bearer token.' },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}

	try {
		const payload = await verifyAccessToken(token);
		return json(
			{
				sub: String(payload.sub ?? ''),
				email: String(payload.email ?? ''),
				email_verified: Boolean(payload.email_verified),
				name: String(payload.name ?? '')
			},
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (accessError) {
		return json(
			{ error: 'invalid_token', error_description: (accessError as Error).message },
			{ status: 401, headers: { 'cache-control': 'no-store' } }
		);
	}
};
