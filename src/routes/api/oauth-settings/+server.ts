import { json } from '@sveltejs/kit';
import { getSupabaseUrl, getSupabaseAnonKey } from '$lib/server/supabase';

interface SupabaseAuthSettings {
	external: Record<string, boolean>;
	disable_signup: boolean;
	mailer_autoconfirm: boolean;
	phone_autoconfirm: boolean;
}

/**
 * Fetch Supabase Auth settings to determine enabled OAuth providers
 */
export async function GET() {
	try {
		const supabaseUrl = getSupabaseUrl();
		const anonKey = getSupabaseAnonKey();

		const settingsUrl = new URL('/auth/v1/settings', supabaseUrl);
		settingsUrl.searchParams.set('apikey', anonKey);

		const response = await fetch(settingsUrl.toString());

		if (!response.ok) {
			return json(
				{ error: `Supabase settings fetch failed: ${response.statusText}` },
				{ status: response.status }
			);
		}

		const settings: SupabaseAuthSettings = await response.json();

		// Extract enabled providers (excluding email which is handled separately)
		const enabledProviders = Object.entries(settings.external ?? {})
			.filter(([provider, enabled]) => enabled && provider !== 'email')
			.map(([provider]) => provider);

		return json({
			providers: enabledProviders,
			emailEnabled: settings.external?.email ?? false,
			signupDisabled: settings.disable_signup ?? false
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{ error: `Failed to fetch OAuth settings: ${message}` },
			{ status: 500 }
		);
	}
}
