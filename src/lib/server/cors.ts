/**
 * CORS configuration for OAuth endpoints
 * Uses ALLOWED_ORIGINS env var (comma-separated list of allowed origins)
 */

/**
 * Get allowed origins from environment variable
 * Format: ALLOWED_ORIGINS="http://localhost:3000,https://chat.nawab-as.software"
 */
function getAllowedOrigins(): string[] {
	const envOrigins = process.env.ALLOWED_ORIGINS || '';
	return envOrigins
		.split(',')
		.map(origin => origin.trim())
		.filter(origin => origin.length > 0);
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
	if (!isOriginAllowed(requestOrigin)) {
		return new Response('Not Allowed', { status: 403 });
	}

	return new Response(null, {
		status: 204,
		headers: getCorsHeaders(requestOrigin)
	});
}
