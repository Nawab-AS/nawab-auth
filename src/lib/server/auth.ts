import { redirect } from '@sveltejs/kit';
import type { SupabaseSessionUser } from '$lib/server/supabase';

/**
 * Ensures the current user is authenticated.
 * If not authenticated, redirects to login with a returnTo URL.
 * @param user - The authenticated user (from event.locals.user)
 * @param currentPath - The current request path
 * @throws Redirect to login if user is not authenticated
 */
export function requireAuth(user: SupabaseSessionUser | undefined, currentPath: string): asserts user is SupabaseSessionUser {
	if (!user) {
		throw redirect(303, `/login?returnTo=${encodeURIComponent(currentPath)}`);
	}
}

/**
 * Ensures the current user has admin role.
 * If not admin, redirects to dashboard.
 * @param user - The authenticated user
 * @throws Redirect to dashboard if user is not admin
 */
export function requireAdmin(user: SupabaseSessionUser | undefined): asserts user is SupabaseSessionUser {
	if (!user) {
		throw redirect(303, '/login');
	}

	if (!user.isAdmin) {
		throw redirect(303, '/dashboard');
	}
}
