import { env } from '$env/dynamic/private';
import { getSupabaseAnonKey, getSupabaseUrl } from '$lib/server/supabase';

interface OAuthSettings {
	providers: string[];
	emailEnabled: boolean;
	signupDisabled: boolean;
}

interface SupabaseAuthSettings {
	external: Record<string, boolean>;
	disable_signup: boolean;
	mailer_autoconfirm: boolean;
	phone_autoconfirm: boolean;
}

const DEFAULT_OAUTH_SETTINGS: OAuthSettings = {
	providers: [],
	emailEnabled: false,
	signupDisabled: false
};

function parseOAuthSettings(settings: SupabaseAuthSettings): OAuthSettings {
	const enabledProviders = Object.entries(settings.external ?? {})
		.filter(([provider, enabled]) => enabled && provider !== 'email')
		.map(([provider]) => provider);

	return {
		providers: enabledProviders,
		emailEnabled: settings.external?.email ?? false,
		signupDisabled: settings.disable_signup ?? false
	};
}

export async function getOAuthSettings(): Promise<OAuthSettings> {
	try {
		const supabaseUrl = env.SUPABASE_URL?.trim() || getSupabaseUrl();
		const anonKey = env.SUPABASE_ANON_KEY?.trim() || getSupabaseAnonKey();
		const settingsUrl = new URL('/auth/v1/settings', supabaseUrl);
		settingsUrl.searchParams.set('apikey', anonKey);

		const response = await fetch(settingsUrl.toString());
		if (!response.ok) {
			return DEFAULT_OAUTH_SETTINGS;
		}

		const settings = (await response.json()) as SupabaseAuthSettings;
		return parseOAuthSettings(settings);
	} catch (error) {
		console.error('Failed to load OAuth settings:', error);
		return DEFAULT_OAUTH_SETTINGS;
	}
}

export function getProviderDisplayName(provider: string): string {
	const names: Record<string, string> = {
		github: 'GitHub',
		google: 'Google',
		discord: 'Discord',
		apple: 'Apple',
		facebook: 'Facebook',
		linkedin: 'LinkedIn',
		azure: 'Microsoft',
		gitlab: 'GitLab',
		bitbucket: 'Bitbucket',
		twitch: 'Twitch',
		twitter: 'X',
		slack: 'Slack',
		spotify: 'Spotify'
	};

	return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}
