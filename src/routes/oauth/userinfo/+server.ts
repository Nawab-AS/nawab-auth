import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { verifyAccessToken } from '$lib/server/oidc';
import { getSupabaseUrl } from '$lib/server/supabase';
import { getCorsHeaders, handleCorsPreFlight } from '$lib/server/cors';

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
	const client = createServiceRoleClient();
	if (!client) {
		throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for strict OIDC name resolution.');
	}

	const { data, error } = await client
		.from('user_profiles')
		.select('preferred_name')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to fetch preferred_name for user ${userId}: ${error.message}`);
	}

	const preferredName = String((data as { preferred_name?: string | null } | null)?.preferred_name ?? '').trim();
	if (!preferredName) {
		throw new Error(`Missing preferred_name for user ${userId}.`);
	}

	return preferredName;
}

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
		const userId = String(payload.sub ?? '').trim();
		const preferredName = userId ? await getPreferredName(userId) : '';
		return json(
			{
				sub: userId,
				email: String(payload.email ?? ''),
				email_verified: Boolean(payload.email_verified),
				name: preferredName,
				preferred_username: preferredName
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
