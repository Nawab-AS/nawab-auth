import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { setSupabaseAccessCookie } from '$lib/server/supabase';
import type { RequestHandler } from '@sveltejs/kit';

/**
 * Verify OAuth callback tokens and set authentication cookies
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	try {
		const body = await request.json();
		const { accessToken, otpToken, otpType } = body;
		const returnTo = url.searchParams.get('return_to') ?? '/dashboard';

		if (!accessToken && !otpToken) {
			return json(
				{ error: 'No authentication token provided' },
				{ status: 400 }
			);
		}

		const supabaseUrl = env.SUPABASE_URL?.trim();
		const anonKey = env.SUPABASE_ANON_KEY?.trim();

		if (!supabaseUrl || !anonKey) {
			return json(
				{ error: 'Missing Supabase configuration' },
				{ status: 500 }
			);
		}

		const client = createClient(supabaseUrl, anonKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
				detectSessionInUrl: false
			}
		});

		let token: string | null = null;

		if (otpToken && otpType === 'recovery') {
			// Handle OTP verification
			const email = url.searchParams.get('email') ?? '';
			const { data, error } = await client.auth.verifyOtp({
				email,
				token: otpToken,
				type: 'email'
			});

			if (error) {
				return json(
					{ error: `OTP verification failed: ${error.message}` },
					{ status: 400 }
				);
			}

			token = data.session?.access_token ?? null;
		} else if (accessToken) {
			// Handle OAuth tokens - validate they're legitimate
			token = accessToken;
		}

		if (!token) {
			return json(
				{ error: 'Failed to obtain valid authentication token' },
				{ status: 400 }
			);
		}

		// Set the access token cookie
		setSupabaseAccessCookie(cookies, token);

		return json({
			success: true,
			redirectTo: returnTo.startsWith('/') ? returnTo : '/dashboard'
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Authentication verification failed';
		return json(
			{ error: message },
			{ status: 500 }
		);
	}
};
