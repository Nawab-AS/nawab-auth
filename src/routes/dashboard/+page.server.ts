import { fail, redirect } from '@sveltejs/kit';
import { buildDashboardSnapshot } from '$lib/server/oidc';
import { createSupabaseAuthedClient, getAccessTokenFromCookies } from '$lib/server/supabase';
import { getOAuthSettings, getProviderDisplayName } from '$lib/server/oauth-settings';
import { getLinkedProviders, revokeLinkedProvider } from '$lib/server/providers';
import { rollApiKey, setApiKeyDisabled } from '$lib/server/account';
import { parseBoolean } from '$lib/server/http';
import type { Provider } from '@supabase/supabase-js';
import type { Actions, PageServerLoad } from './$types';

interface DashboardProvider {
	provider: string;
	displayName: string;
	isLinked: boolean;
}

export const load: PageServerLoad = async ({ url, locals, cookies, fetch }) => {
	// User is guaranteed to be present due to route protection in hooks.server.ts
	// But we can assert it here for type safety if needed
	const user = locals.user;
	const accessToken = getAccessTokenFromCookies(cookies);
	const snapshot = await buildDashboardSnapshot(user!, accessToken);
	const oauthSettings = await getOAuthSettings(fetch);
	const enabledProviders = oauthSettings.providers;

	let linkedProviderNames = new Set<string>();

	if (accessToken) {
		try {
			const identities = await getLinkedProviders(accessToken);
			linkedProviderNames = new Set(identities.map((identity) => identity.provider));
		} catch (error) {
			console.error('Failed to load linked identities for dashboard:', error);
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
		rolled: url.searchParams.get('rolled') === '1'
	};
};

export const actions: Actions = {
	rollKey: async ({ locals, cookies }) => {
		const user = locals.user;
		if (!user) {
			throw redirect(303, '/login?return_to=%2Fdashboard');
		}

		const accessToken = getAccessTokenFromCookies(cookies);
		if (!accessToken) {
			throw redirect(303, '/login?return_to=%2Fdashboard');
		}

		try {
			await rollApiKey(user.id, accessToken);
			throw redirect(303, '/dashboard?rolled=1');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to roll API key.';
			return fail(400, { rollMessage: message });
		}
	},
	disableKey: async ({ locals, cookies, request }) => {
		const user = locals.user;
		if (!user) {
			throw redirect(303, '/login?return_to=%2Fdashboard');
		}

		const accessToken = getAccessTokenFromCookies(cookies);
		if (!accessToken) {
			throw redirect(303, '/login?return_to=%2Fdashboard');
		}

		const formData = await request.formData();
		const disabled = parseBoolean(String(formData.get('disabled') ?? 'true'), true);

		try {
			await setApiKeyDisabled(user.id, accessToken, disabled);
			return {
				keyMessage: disabled ? 'API key disabled.' : 'API key enabled.'
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update API key state.';
			return fail(400, { keyMessage: message });
		}
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

		const redirectTo = new URL('/auth/callback?return_to=%2Fdashboard', url.origin).toString();
		const supabase = createSupabaseAuthedClient(accessToken);
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

		try {
			const revoked = await revokeLinkedProvider(accessToken, provider);
			if (!revoked) {
				return fail(400, {
					providerMessage: `${getProviderDisplayName(provider)} is not currently linked.`
				});
			}

			return {
				providerMessage: `${getProviderDisplayName(provider)} was revoked successfully.`
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to revoke provider.';
			return fail(400, {
				providerMessage: message
			});
		}
	}
};
