import { fail, redirect } from '@sveltejs/kit';
import { buildDashboardSnapshot, createRollRequestId } from '$lib/server/oidc';
import {
	createSupabaseAuthedClient,
	getAccessTokenFromCookies
} from '$lib/server/supabase';
import type { Provider } from '@supabase/supabase-js';
import type { Actions, PageServerLoad } from './$types';

interface OAuthSettings {
	providers: string[];
}

interface DashboardProvider {
	provider: string;
	displayName: string;
	isLinked: boolean;
}

function getProviderDisplayName(provider: string): string {
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

async function getEnabledProviders(fetchFn: typeof fetch) {
	let settings: OAuthSettings = { providers: [] };

	try {
		const response = await fetchFn('/api/oauth-settings');
		if (response.ok) {
			settings = await response.json();
		}
	} catch (err) {
		console.error('Failed to load OAuth providers for dashboard:', err);
	}

	return settings.providers;
}

export const load: PageServerLoad = async ({ url, locals, cookies, fetch }) => {
	// User is guaranteed to be present due to route protection in hooks.server.ts
	// But we can assert it here for type safety if needed
	const user = locals.user;
	const accessToken = getAccessTokenFromCookies(cookies);
	const snapshot = await buildDashboardSnapshot(user!, accessToken);
	const enabledProviders = await getEnabledProviders(fetch);

	const supabase = accessToken ? createSupabaseAuthedClient(accessToken) : null;
	let linkedProviderNames = new Set<string>();

	if (supabase) {
		const { data: identityData, error: identityError } = await supabase.auth.getUserIdentities();
		if (identityError) {
			console.error('Failed to load linked identities for dashboard:', identityError);
		} else {
			linkedProviderNames = new Set(
				(identityData?.identities ?? [])
					.map((identity) => identity.provider)
					.filter((provider): provider is string => Boolean(provider))
			);
		}
	}

	const providers: DashboardProvider[] = enabledProviders
		.map((provider) => ({
			provider,
			displayName: getProviderDisplayName(provider),
			isLinked: linkedProviderNames.has(provider)
		}))
		.sort((a, b) => a.displayName.localeCompare(b.displayName));

	return {
		user,
		...snapshot,
		providers,
		rolled: url.searchParams.get('rolled') === '1',
		rollRequestId: url.searchParams.get('rollRequestId') ?? null
	};
};

export const actions: Actions = {
	rollKey: async ({ request }) => {
		const formData = await request.formData();
		const role = String(formData.get('role') ?? 'user');

		if (role !== 'user' && role !== 'admin') {
			return fail(400, { rollMessage: 'Invalid role for key roll request.' });
		}

		const rollRequestId = createRollRequestId();
		throw redirect(303, `/dashboard?rolled=1&rollRequestId=${encodeURIComponent(rollRequestId)}`);
	},
	linkProvider: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const provider = String(formData.get('provider') ?? '').trim().toLowerCase();

		if (!provider) {
			return fail(400, { providerMessage: 'Provider is required.' });
		}

		const accessToken = getAccessTokenFromCookies(cookies);
		if (!accessToken) {
			throw redirect(303, '/login?return_to=%2Fdashboard');
		}

		const supabase = createSupabaseAuthedClient(accessToken);
		const redirectTo = new URL('/auth/callback?return_to=%2Fdashboard', url.origin).toString();
		const { data, error } = await supabase.auth.linkIdentity({
			provider: provider as Provider,
			options: {
				redirectTo,
				skipBrowserRedirect: true
			}
		});

		if (error || !data?.url) {
			return fail(400, {
				providerMessage: error?.message ?? `Could not start linking for ${provider}.`
			});
		}

		throw redirect(303, data.url);
	},
	revokeProvider: async ({ request, cookies }) => {
		const formData = await request.formData();
		const provider = String(formData.get('provider') ?? '').trim().toLowerCase();

		if (!provider) {
			return fail(400, { providerMessage: 'Provider is required.' });
		}

		const accessToken = getAccessTokenFromCookies(cookies);
		if (!accessToken) {
			throw redirect(303, '/login?return_to=%2Fdashboard');
		}

		const supabase = createSupabaseAuthedClient(accessToken);
		const { data: identityData, error: identitiesError } = await supabase.auth.getUserIdentities();

		if (identitiesError) {
			return fail(400, { providerMessage: identitiesError.message });
		}

		const matchingIdentity = (identityData?.identities ?? []).find(
			(identity) => identity.provider === provider
		);

		if (!matchingIdentity) {
			return fail(400, {
				providerMessage: `${getProviderDisplayName(provider)} is not currently linked.`
			});
		}

		const { error } = await supabase.auth.unlinkIdentity(matchingIdentity);
		if (error) {
			return fail(400, { providerMessage: error.message });
		}

		return {
			providerMessage: `${getProviderDisplayName(provider)} was revoked successfully.`
		};
	}
};
