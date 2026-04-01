import { redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { setSupabaseAccessCookie } from '$lib/server/supabase';
import type { RequestHandler } from '@sveltejs/kit';

/**
 * OAuth callback handler for Supabase Auth redirects
 * Handles both OTP verify tokens and OAuth provider callbacks
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	try {
		const supabaseUrl = env.SUPABASE_URL?.trim();
		const anonKey = env.SUPABASE_ANON_KEY?.trim();

		if (!supabaseUrl || !anonKey) {
			throw new Error('Missing Supabase configuration');
		}

		const client = createClient(supabaseUrl, anonKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
				detectSessionInUrl: false
			}
		});

		// Handle OTP token verification
		const token = url.searchParams.get('token');
		const type = url.searchParams.get('type');
		
		if (token && type === 'recovery') {
			// OTP token verification
			const { data, error } = await client.auth.verifyOtp({
				email: url.searchParams.get('email') ?? '',
				token,
				type: 'email'
			});

			if (error) {
				throw new Error(`OTP verification failed: ${error.message}`);
			}

			if (data.session?.access_token) {
				setSupabaseAccessCookie(cookies, data.session.access_token);
			}
		} else {
			// OAuth provider callback - extract from URL hash
			// Supabase OAuth redirects with #access_token=...&expires_in=...
			// We need to use the Auth client to parse the session
			const { data, error } = await client.auth.getSession();

			if (error || !data.session?.access_token) {
				throw new Error('OAuth authentication failed - no session established');
			}

			setSupabaseAccessCookie(cookies, data.session.access_token);
		}

		const returnTo = url.searchParams.get('return_to') ?? '/dashboard';
		throw redirect(303, returnTo.startsWith('/') ? returnTo : '/dashboard');
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Authentication failed';
		const returnTo = url.searchParams.get('return_to') ?? '/login';
		throw redirect(
			303,
			`${returnTo.startsWith('/') ? returnTo : '/login'}?error=${encodeURIComponent(message)}`
		);
	}
};
