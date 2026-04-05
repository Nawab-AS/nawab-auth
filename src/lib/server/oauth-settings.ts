interface OAuthSettings {
	providers: string[];
	emailEnabled: boolean;
	signupDisabled: boolean;
}

const DEFAULT_OAUTH_SETTINGS: OAuthSettings = {
	providers: [],
	emailEnabled: false,
	signupDisabled: false
};

export async function getOAuthSettings(fetchFn: typeof fetch): Promise<OAuthSettings> {
	try {
		const response = await fetchFn('/api/oauth-settings');
		if (!response.ok) {
			return DEFAULT_OAUTH_SETTINGS;
		}

		const payload = (await response.json()) as OAuthSettings;
		return {
			providers: Array.isArray(payload.providers) ? payload.providers : [],
			emailEnabled: Boolean(payload.emailEnabled),
			signupDisabled: Boolean(payload.signupDisabled)
		};
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
