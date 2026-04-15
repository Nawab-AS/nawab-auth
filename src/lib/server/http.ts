type BodyValue = FormDataEntryValue | unknown;

const RETURN_TO_FALLBACK = '/dashboard';

function isSafeInternalPath(path: string): boolean {
	return path.startsWith('/') && !path.startsWith('//') && !/[\r\n]/.test(path);
}

export function normalizeReturnToPath(raw: string | null | undefined, fallback = RETURN_TO_FALLBACK): string {
	const value = (raw ?? '').trim();
	if (!value || !isSafeInternalPath(value)) {
		return fallback;
	}

	return value;
}

export async function readFormOrJsonBody(request: Request): Promise<Record<string, BodyValue>> {
	const contentType = (request.headers.get('content-type') ?? '').toLowerCase();

	try {
		if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
			return Object.fromEntries((await request.formData()).entries());
		}

		if (contentType.includes('application/json')) {
			const body = await request.json();
			if (body && typeof body === 'object' && !Array.isArray(body)) {
				return body as Record<string, BodyValue>;
			}
		}
	} catch (err) {
		console.warn('[readFormOrJsonBody] Error parsing request body:', err);
	}

	return {};
}

export function parseBoolean(value: string | null | undefined, defaultValue = false): boolean {
	if (value == null) {
		return defaultValue;
	}

	const normalized = value.trim().toLowerCase();
	if (normalized === 'true') {
		return true;
	}

	if (normalized === 'false') {
		return false;
	}

	return defaultValue;
}

export function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (typeof error === 'object' && error !== null && 'message' in error) {
		const value = (error as { message?: unknown }).message;
		if (typeof value === 'string' && value.trim()) {
			return value;
		}
	}

	return fallback;
}
