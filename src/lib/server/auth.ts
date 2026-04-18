import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { SupabaseSessionUser } from '$lib/server/supabase';

function normalizeEmailDomain(value: string): string {
	return value.trim().toLowerCase();
}

function getConfiguredOtpAllowedEmailDomains(): Set<string> {
	const raw = env.OTP_ALLOWED_EMAIL_DOMAINS?.trim() ?? '';
	const domains = raw
		.split(',')
		.map((domain) => normalizeEmailDomain(domain))
		.filter((domain) => domain.length > 0);

	return new Set(domains);
}

export function isOtpEmailDomainAllowed(email: string): boolean {
	const normalizedEmail = email.trim().toLowerCase();
	const atIndex = normalizedEmail.lastIndexOf('@');
	if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) {
		return false;
	}

	const domain = normalizeEmailDomain(normalizedEmail.slice(atIndex + 1));
	const allowedDomains = getConfiguredOtpAllowedEmailDomains();
	if (allowedDomains.size === 0) {
		return true;
	}

	return allowedDomains.has(domain);
}

/**
 * Ensures the current user is authenticated.
 * If not authenticated, redirects to login with a returnTo URL.
 * @param user - The authenticated user (from event.locals.user)
 * @param currentPath - The current request path
 * @throws Redirect to login if user is not authenticated
 */
export function requireAuth(user: SupabaseSessionUser | undefined, currentPath: string): asserts user is SupabaseSessionUser {
	if (!user) {
		throw redirect(303, `/login?redirect_to=${encodeURIComponent(currentPath)}`);
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
