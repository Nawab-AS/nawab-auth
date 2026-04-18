import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from '$lib/server/supabase';
import { isOtpEmailDomainAllowed } from '$lib/server/auth';

const OTP_WINDOW_MS = 45_000;
const otpRequestCooldown = new Map<string, number>();

function isValidEmail(email: string): boolean {
	if (!email || email.length > 320) {
		return false;
	}

	// Basic validation to keep obviously invalid addresses out of the auth call.
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getOtpThrottleKey(request: Request, normalizedEmail: string): string {
	const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
	const ip = forwardedFor.split(',')[0]?.trim() || 'unknown';
	return `${ip}:${normalizedEmail}`;
}

/**
 * Send OTP to email for passwordless login
 */
export async function POST({ request }) {
	try {
		const body = (await request.json()) as { email?: unknown };
		const email = typeof body.email === 'string' ? body.email : '';

		if (!email) {
			return json(
				{ error: 'Email is required' },
				{ status: 400 }
			);
		}

		const normalizedEmail = email.toLowerCase().trim();
		if (!isValidEmail(normalizedEmail)) {
			return json(
				{ error: 'Invalid email format' },
				{ status: 400 }
			);
		}

		if (!isOtpEmailDomainAllowed(normalizedEmail)) {
			return json(
				{ error: 'This email provider is not allowed.' },
				{ status: 400 }
			);
		}

		const now = Date.now();
		const throttleKey = getOtpThrottleKey(request, normalizedEmail);
		const nextAllowedAt = otpRequestCooldown.get(throttleKey) ?? 0;
		if (nextAllowedAt > now) {
			const retryAfterSeconds = Math.ceil((nextAllowedAt - now) / 1000);
			return json(
				{ error: `Please wait ${retryAfterSeconds}s before requesting another code.` },
				{ status: 429, headers: { 'retry-after': String(retryAfterSeconds) } }
			);
		}

		const supabaseUrl = getSupabaseUrl();
		const anonKey = getSupabaseAnonKey();

		const client = createClient(supabaseUrl, anonKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
				detectSessionInUrl: false
			}
		});

		// Send OTP via Supabase Auth
		const { data, error } = await client.auth.signInWithOtp({
			email: normalizedEmail
		});

		if (error) {
			return json(
				{ error: error.message },
				{ status: 400 }
			);
		}

		otpRequestCooldown.set(throttleKey, now + OTP_WINDOW_MS);

		return json({
			success: true,
			message: 'OTP sent to email',
			data
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{ error: `Failed to send OTP: ${message}` },
			{ status: 500 }
		);
	}
}
