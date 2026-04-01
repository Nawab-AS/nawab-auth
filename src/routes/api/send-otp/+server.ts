import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

/**
 * Send OTP to email for passwordless login
 */
export async function POST({ request }) {
	try {
		const { email } = await request.json();

		if (!email || typeof email !== 'string') {
			return json(
				{ error: 'Email is required' },
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

		// Send OTP via Supabase Auth
		const { data, error } = await client.auth.signInWithOtp({
			email: email.toLowerCase().trim(),
			options: {
				emailRedirectTo: `${new URL(request.url).origin}/auth/callback`
			}
		});

		if (error) {
			return json(
				{ error: error.message },
				{ status: 400 }
			);
		}

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
