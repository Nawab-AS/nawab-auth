import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSupabaseUrl } from '$lib/server/supabase';

interface OAuthSettings {
	providers: string[];
	emailEnabled: boolean;
	signupDisabled: boolean;
}

export const load: PageServerLoad = async ({ url, fetch, locals }) => {
	const user = locals.user;

	// Redirect authenticated users to dashboard
	if (user) {
		throw redirect(303, '/dashboard');
	}

	const returnTo = url.searchParams.get('return_to') ?? '/dashboard';
	
	let oauthSettings: OAuthSettings = {
		providers: [],
		emailEnabled: false,
		signupDisabled: false
	};

	// Fetch available OAuth providers from Supabase
	try {
		const response = await fetch('/api/oauth-settings');
		if (response.ok) {
			oauthSettings = await response.json();
		}
	} catch (err) {
		console.error('Failed to load OAuth settings:', err);
	}

	const supabaseUrl = getSupabaseUrl();

	return {
		returnTo,
		oauthSettings,
		supabaseUrl
	};
};

export const actions: Actions = {
	sendOtp: async ({ request, fetch }) => {
		const formData = await request.formData();
		const email = String(formData.get('email') ?? '').trim();
		const returnTo = String(formData.get('return_to') ?? '/dashboard').trim() || '/dashboard';

		if (!email) {
			return fail(400, { message: 'Email is required.', returnTo, email });
		}

		try {
			const response = await fetch('/api/send-otp', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email })
			});

			const data = await response.json();

			if (!response.ok) {
				return fail(response.status, {
					message: data.error ?? 'Failed to send OTP.',
					returnTo,
					email
				});
			}

			return {
				success: true,
				message: `OTP sent to ${email}. Check your inbox.`,
				returnTo,
				otpSent: true,
				email
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to send OTP.';
			return fail(500, { message, returnTo, email });
		}
	}
};
