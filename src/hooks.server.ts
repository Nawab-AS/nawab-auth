import { isRedirect, redirect, type Handle } from '@sveltejs/kit';
import { BANNED_ACCOUNT_MESSAGE, isUserBanned, isUserOnboarded } from '$lib/server/account';
import {
	clearSupabaseSessionCookies,
	getAccessTokenFromCookies,
	getRefreshTokenFromCookies,
	getSupabaseUserFromAccessToken,
	refreshSupabaseSession,
	setSupabaseSessionCookies
} from '$lib/server/supabase';

/**
 * Routes that don't require authentication
 */
const PUBLIC_ROUTES = [
	'/login',
	'/oauth/',
	'/auth/',
	'/terms',
	'/api/',
	'/.well-known/'
];

function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Resolve the session user, transparently refreshing an expired access token
 * via the stored refresh token. Returns null (clearing both cookies) when
 * the session can no longer be revived.
 */
async function resolveSessionUser(cookies: import('@sveltejs/kit').Cookies) {
	const accessToken = getAccessTokenFromCookies(cookies);
	if (accessToken) {
		const user = await getSupabaseUserFromAccessToken(accessToken);
		if (user) {
			return user;
		}
	}

	const refreshToken = getRefreshTokenFromCookies(cookies);
	if (!refreshToken) {
		return null;
	}

	const refreshed = await refreshSupabaseSession(refreshToken);
	if (!refreshed) {
		clearSupabaseSessionCookies(cookies);
		return null;
	}

	setSupabaseSessionCookies(cookies, refreshed.accessToken, refreshed.refreshToken);
	return refreshed.user;
}

export const handle: Handle = async ({ event, resolve }) => {
	const user = await resolveSessionUser(event.cookies);
	event.locals.user = user ?? undefined;

	if (user) {
		const accessToken = getAccessTokenFromCookies(event.cookies);
		if (accessToken) {
			try {
				if (await isUserBanned(user.id, accessToken)) {
					clearSupabaseSessionCookies(event.cookies);
					throw redirect(303, `/login?error=${encodeURIComponent(BANNED_ACCOUNT_MESSAGE)}`);
				}
			} catch (err) {
				if (isRedirect(err)) {
					throw err;
				}

				console.error('Failed to check banned status:', err);
			}
		}
	}

	// Check if the route is public
	if (isPublicRoute(event.url.pathname)) {
		return resolve(event);
	}

	// If no user and route is protected, redirect to login
	if (!user) {
		if (event.url.pathname === '/') {
			throw redirect(303, '/login');
		}

		const returnTo = `${event.url.pathname}${event.url.search}`;
		throw redirect(303, `/login?redirect_to=${encodeURIComponent(returnTo)}`);
	}

	if (event.url.pathname === '/') {
		throw redirect(303, `/dashboard`);
	}

	if (event.url.pathname !== '/onboarding' && event.url.pathname !== '/logout') {
		const accessToken = getAccessTokenFromCookies(event.cookies);
		const onboarded = await isUserOnboarded(user.id, accessToken);
		if (!onboarded) {
			throw redirect(303, '/onboarding');
		}
	}

	return resolve(event);
};
