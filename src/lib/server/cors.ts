/**
 * CORS configuration for OAuth endpoints
 * Uses ALLOWED_ORIGINS env var (comma-separated list of allowed origins)
 */
import { env } from '$env/dynamic/private';
import { getAllowedRedirectUris, getIssuer } from '$lib/server/oidc';

function toOrigin(value: string): string | null {
	try {
		return new URL(value.trim()).origin;
	} catch {
		return null;
	}
}

/**
 * Get allowed origins from environment variable
 * Format: ALLOWED_ORIGINS="http://localhost:3000,https://chat.example.com"
 */
function getAllowedOrigins(): string[] {
	const configuredOrigins = (env.ALLOWED_ORIGINS ?? '')
		.split(',')
		.map((origin) => toOrigin(origin))
		.filter((origin): origin is string => Boolean(origin));

	// Fallback: derive browser origins from configured redirect URIs.
	const redirectUriOrigins = getAllowedRedirectUris()
		.map((redirectUri) => toOrigin(redirectUri))
		.filter((origin): origin is string => Boolean(origin));

	const issuerOrigin = toOrigin(getIssuer());

	return [...new Set([
		...configuredOrigins,
		...redirectUriOrigins,
		...(issuerOrigin ? [issuerOrigin] : [])
	])];
}

/**
 * Check if an origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
	if (!origin) return false;
	const allowedOrigins = getAllowedOrigins();
	return allowedOrigins.includes(origin);
}

/**
 * Get CORS headers for a response
 * Returns empty object if origin not allowed
 */
export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
	if (!requestOrigin || !isOriginAllowed(requestOrigin)) {
		return {};
	}

	return {
		Vary: 'Origin',
		'Access-Control-Allow-Origin': requestOrigin,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		'Access-Control-Max-Age': '3600'
	};
}

/**
 * Handle OPTIONS preflight requests for CORS
 */
export function handleCorsPreFlight(requestOrigin: string | null) {
	const corsHeaders = getCorsHeaders(requestOrigin);
	return new Response(null, {
		status: 204,
		headers: {
			Vary: 'Origin',
			...corsHeaders
		}
	});
}
