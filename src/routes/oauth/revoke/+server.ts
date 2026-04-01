import { json } from '@sveltejs/kit';
import { revokeToken } from '$lib/server/oidc';

export const POST = async ({ request }) => {
	const contentType = request.headers.get('content-type') ?? '';
	const isForm = contentType.includes('application/x-www-form-urlencoded');
	const body = isForm
		? Object.fromEntries((await request.formData()).entries())
		: ((await request.json()) as Record<string, unknown>);

	const token = String(body.token ?? '').trim();
	if (!token) {
		return json(
			{ error: 'invalid_request', error_description: 'token is required.' },
			{ status: 400, headers: { 'cache-control': 'no-store' } }
		);
	}

	try {
		await revokeToken(token);
	} catch {
		// Intentionally return 200 per RFC 7009 semantics.
	}

	return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
};
