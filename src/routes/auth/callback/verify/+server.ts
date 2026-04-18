import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import {
	BANNED_ACCOUNT_MESSAGE,
	isUserOnboarded,
	isUserBanned
} from '$lib/server/account';
import { getSupabaseUserFromAccessToken, setSupabaseAccessCookie } from '$lib/server/supabase';
import { normalizeReturnToPath, readFormOrJsonBody } from '$lib/server/http';
import type { RequestHandler } from '@sveltejs/kit';

const AUTH_RETURN_TO_COOKIE = 'auth_return_to';

function isGenericReturnTo(value: string) {
	return value === '/' || value === '/dashboard';
}

function getEffectiveReturnTo(primary: string | null | undefined, cookieValue: string | null | undefined) {
	const normalizedPrimary = normalizeReturnToPath(primary);
	const normalizedCookie = cookieValue ? normalizeReturnToPath(cookieValue) : null;

	if (normalizedCookie?.startsWith('/oauth/authorize') && isGenericReturnTo(normalizedPrimary)) {
		return normalizedCookie;
	}

	return normalizedPrimary;
}

/**
 * Verify OAuth callback tokens and set authentication cookies
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	try {
		const body = await readFormOrJsonBody(request);
		const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
		const otpToken = typeof body.otpToken === 'string' ? body.otpToken.trim() : '';
		const otpType = typeof body.otpType === 'string' ? body.otpType.trim() : '';
		const returnTo = getEffectiveReturnTo(
			url.searchParams.get('redirect_to') ?? url.searchParams.get('return_to'),
			cookies.get(AUTH_RETURN_TO_COOKIE)
		);

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

			if (!data.user || !data.session?.access_token) {
				return json(
					{ error: 'Failed to resolve user for OTP verification.' },
					{ status: 400 }
				);
			}

			if (await isUserBanned(data.user.id, data.session.access_token)) {
				return json({ error: BANNED_ACCOUNT_MESSAGE }, { status: 403 });
			}

			token = data.session?.access_token ?? null;
		} else if (accessToken) {
			// Handle OAuth tokens - validate they're legitimate
			const user = await getSupabaseUserFromAccessToken(accessToken);

			if (!user) {
				return json(
					{ error: 'Failed to resolve authenticated user.' },
					{ status: 400 }
				);
			}

			if (await isUserBanned(user.id, accessToken)) {
				return json({ error: BANNED_ACCOUNT_MESSAGE }, { status: 403 });
			}

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

		const resolvedUser = await getSupabaseUserFromAccessToken(token);
		if (resolvedUser && !(await isUserOnboarded(resolvedUser.id, token))) {
			return json({
				success: true,
				redirectTo: '/onboarding'
			});
		}

		cookies.delete(AUTH_RETURN_TO_COOKIE, { path: '/' });

		return json({
			success: true,
			redirectTo: returnTo
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Authentication verification failed';
		return json(
			{ error: message },
			{ status: 500 }
		);
	}
};
