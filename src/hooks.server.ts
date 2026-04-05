import { isRedirect, redirect, type Handle } from '@sveltejs/kit';
import { BANNED_ACCOUNT_MESSAGE, isUserBanned, isUserOnboarded } from '$lib/server/account';
import {
	clearSupabaseAccessCookie,
	getAccessTokenFromCookies,
	getSupabaseUserFromCookies
} from '$lib/server/supabase';

/**
 * Routes that don't require authentication
 */
const PUBLIC_ROUTES = [
	'/login',
	'/auth/',
	'/terms',
	'/api/',
	'/.well-known/'
];

function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

export const handle: Handle = async ({ event, resolve }) => {
	const user = await getSupabaseUserFromCookies(event.cookies);
	event.locals.user = user ?? undefined;

	if (user) {
		const accessToken = getAccessTokenFromCookies(event.cookies);
		if (accessToken) {
			try {
				if (await isUserBanned(user.id, accessToken)) {
					clearSupabaseAccessCookie(event.cookies);
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
		throw redirect(303, `/login?return_to=${encodeURIComponent(event.url.pathname)}`);
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
