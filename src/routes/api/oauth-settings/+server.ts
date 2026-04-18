import { json } from '@sveltejs/kit';
import { getOAuthSettings } from '$lib/server/oauth-settings';

/**
 * Fetch Supabase Auth settings to determine enabled OAuth providers
 */
export async function GET() {
	try {
		const settings = await getOAuthSettings();
		return json({
			providers: settings.providers,
			emailEnabled: settings.emailEnabled,
			signupDisabled: settings.signupDisabled
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json(
			{ error: `Failed to fetch OAuth settings: ${message}` },
			{ status: 500 }
		);
	}
}
