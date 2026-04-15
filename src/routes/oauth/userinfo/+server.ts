import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { verifyAccessToken } from '$lib/server/oidc';
import { getSupabaseUrl } from '$lib/server/supabase';
import { getNoStoreCorsHeaders, handleCorsPreFlight } from '$lib/server/cors';

function getServiceRoleKey() {
	return env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
}

function createServiceRoleClient() {
	const serviceRoleKey = getServiceRoleKey();
	if (!serviceRoleKey) {
		return null;
	}

	return createClient(getSupabaseUrl(), serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false
		}
	});
}

async function getPreferredName(userId: string) {
	try {
		const client = createServiceRoleClient();
		if (!client) {
			return null;
		}

		const { data, error } = await client
			.from('user_profiles')
			.select('preferred_name')
			.eq('user_id', userId)
			.maybeSingle();

		if (error) {
			return null;
		}

		return data?.preferred_name?.trim() ?? null;
	} catch {
		return null;
	}
}

export const OPTIONS = async ({ request }) => {
	const origin = request.headers.get('origin');
	return handleCorsPreFlight(origin);
};

export const GET = async ({ request }) => {
	const responseHeaders = getNoStoreCorsHeaders(request.headers.get('origin'));

	const authorization = request.headers.get('authorization') ?? '';
	const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

	if (!token) {
		return json(
			{ error: 'invalid_token', error_description: 'Missing bearer token.' },
			{ status: 401, headers: responseHeaders }
		);
	}

	try {
		const payload = await verifyAccessToken(token);
		const userId = String(payload.sub ?? '').trim();
		const preferredName = userId ? await getPreferredName(userId) : null;
		return json(
			{
				sub: userId,
				email: String(payload.email ?? ''),
				email_verified: Boolean(payload.email_verified),
				name: preferredName ?? String(payload.name ?? ''),
				preferred_username: String(payload.preferred_username ?? '')
			},
			{ headers: responseHeaders }
		);
	} catch (accessError) {
		return json(
			{ error: 'invalid_token', error_description: (accessError as Error).message },
			{ status: 401, headers: responseHeaders }
		);
	}
};
