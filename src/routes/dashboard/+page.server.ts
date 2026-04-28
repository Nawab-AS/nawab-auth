import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { buildDashboardSnapshot } from '$lib/server/oidc';
import { createSupabaseAuthedClient, getAccessTokenFromCookies } from '$lib/server/supabase';
import { getOAuthSettings, getProviderDisplayName } from '$lib/server/oauth-settings';
import { getLinkedProviders, revokeLinkedProvider } from '$lib/server/providers';
import { rollApiKey, setApiKeyDisabled } from '$lib/server/account';
import { getErrorMessage, parseBoolean } from '$lib/server/http';
import { encodeProxyApiKey } from '$lib/server/key-obfuscation';
import type { Provider } from '@supabase/supabase-js';
import type { Actions, PageServerLoad } from './$types';

interface DashboardProvider {
	provider: string;
	displayName: string;
	isLinked: boolean;
}

function requireDashboardSession(locals: App.Locals, cookies: import('@sveltejs/kit').Cookies) {
	const user = locals.user;
	if (!user) {
		throw redirect(303, '/login?redirect_to=%2Fdashboard');
	}

	const accessToken = getAccessTokenFromCookies(cookies);
	if (!accessToken) {
		throw redirect(303, '/login?redirect_to=%2Fdashboard');
	}

	return { user, accessToken };
}

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	// User is guaranteed to be present due to route protection in hooks.server.ts
	// But we can assert it here for type safety if needed
	const user = locals.user;
	const accessToken = getAccessTokenFromCookies(cookies);
	const authReturnTo = cookies.get('auth_return_to')?.trim() ?? null;

	if (authReturnTo?.startsWith('/oauth/authorize')) {
		// Clear stale OIDC return-to hints so normal dashboard navigation is stable.
		cookies.delete('auth_return_to', { path: '/' });
	}

	const snapshot = await buildDashboardSnapshot(user!, accessToken);
	const oauthSettings = await getOAuthSettings();
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
		supportEmail: env.SUPPORT_EMAIL?.trim() || 'support@example.com',
		rolled: url.searchParams.get('rolled') === '1'
	};
};

export const actions: Actions = {
	rollKey: async ({ locals, cookies }) => {
		const { user, accessToken } = requireDashboardSession(locals, cookies);

		try {
			const rolledKey = await rollApiKey(user.id, accessToken);
			const obfuscatedRolledKey = encodeProxyApiKey(rolledKey);
			if (obfuscatedRolledKey === 'ERROR-INVALID-PREFIX') {
				throw new Error('Failed to encode API key.');
			}

			return {
				rollMessage: 'API key rolled.',
				rolledKey: obfuscatedRolledKey
			};
		} catch (error) {
			return fail(400, { rollMessage: getErrorMessage(error, 'Failed to roll API key.') });
		}
	},
	disableKey: async ({ locals, cookies, request }) => {
		const { user, accessToken } = requireDashboardSession(locals, cookies);

		const formData = await request.formData();
		const disabled = parseBoolean(String(formData.get('disabled') ?? 'true'), true);

		try {
			await setApiKeyDisabled(user.id, accessToken, disabled);
			return {
				keyMessage: disabled ? 'API key disabled.' : 'API key enabled.'
			};
		} catch (error) {
			return fail(400, { keyMessage: getErrorMessage(error, 'Failed to update API key state.') });
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
			throw redirect(303, '/login?redirect_to=%2Fdashboard');
		}

		const redirectTo = new URL('/auth/callback?redirect_to=%2Fdashboard', url.origin).toString();
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
			throw redirect(303, '/login?redirect_to=%2Fdashboard');
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
			return fail(400, {
				providerMessage: getErrorMessage(error, 'Failed to revoke provider.')
			});
		}
	}
};
