import { redirect, type Handle } from '@sveltejs/kit';
import { getSupabaseUserFromCookies } from '$lib/server/supabase';

/**
 * Routes that don't require authentication
 */
const PUBLIC_ROUTES = [
	'/login',
	'/auth/',
	'/api/',
	'/.well-known/'
];

function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

export const handle: Handle = async ({ event, resolve }) => {
	const user = await getSupabaseUserFromCookies(event.cookies);
	event.locals.user = user ?? undefined;

	// Check if the route is public
	if (isPublicRoute(event.url.pathname)) {
		return resolve(event);
	}

	// If no user and route is protected, redirect to login
	if (!user) {
		throw redirect(303, `/login?return_to=${encodeURIComponent(event.url.pathname)}`);
	}

	return resolve(event);
};
