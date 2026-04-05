import { isRedirect, redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import {
	getAccessTokenFromCookies,
	getSupabaseAnonKey,
	getSupabaseUserFromAccessToken,
	getSupabaseUrl,
	setSupabaseAccessCookie
} from '$lib/server/supabase';
import { BANNED_ACCOUNT_MESSAGE, isUserBanned, isUserOnboarded } from '$lib/server/account';
import { normalizeReturnToPath } from '$lib/server/http';
import type { RequestHandler } from '@sveltejs/kit';

/**
 * OAuth callback handler for Supabase Auth redirects
 * Handles both OTP verify tokens and OAuth provider callbacks
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	try {
		const supabaseUrl = getSupabaseUrl();
		const anonKey = getSupabaseAnonKey();

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
				if (!data.user) {
					throw new Error('Failed to resolve user for OTP verification');
				}

				if (await isUserBanned(data.user.id, data.session.access_token)) {
					throw new Error(BANNED_ACCOUNT_MESSAGE);
				}

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

			const user = await getSupabaseUserFromAccessToken(data.session.access_token);
			if (!user) {
				throw new Error('Failed to resolve authenticated user');
			}

			if (await isUserBanned(user.id, data.session.access_token)) {
				throw new Error(BANNED_ACCOUNT_MESSAGE);
			}

			setSupabaseAccessCookie(cookies, data.session.access_token);
		}

		const accessToken = getAccessTokenFromCookies(cookies);
		const user = accessToken ? await getSupabaseUserFromAccessToken(accessToken) : null;
		if (user) {
			const onboarded = await isUserOnboarded(user.id, accessToken);
			if (!onboarded) {
				throw redirect(303, '/onboarding');
			}
		}

		const returnTo = normalizeReturnToPath(url.searchParams.get('return_to'));
		throw redirect(303, returnTo);
	} catch (err) {
		if (isRedirect(err)) {
			throw err;
		}

		const message = err instanceof Error ? err.message : 'Authentication failed';
		const returnTo = normalizeReturnToPath(url.searchParams.get('return_to'), '/login');
		throw redirect(
			303,
			`${returnTo}?error=${encodeURIComponent(message)}`
		);
	}
};
