import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from '$lib/server/supabase';

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
			email: email.toLowerCase().trim()
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
