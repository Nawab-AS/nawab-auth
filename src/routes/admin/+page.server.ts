import { fail, redirect } from '@sveltejs/kit';
import {
	deactivateUserAccount,
	getAdminUserDetail,
	isUserAdmin,
	listAdminUsers,
	rollApiKey,
	setApiKeyDisabled,
	setUserBanned
} from '$lib/server/account';
import { getProviderDisplayName } from '$lib/server/oauth-settings';
import { getLinkedProviders, revokeLinkedProvider } from '$lib/server/providers';
import { getAdminUserEmail, getAdminUserProviders, revokeProviderForUser } from '$lib/server/admin-auth';
import { getAccessTokenFromCookies } from '$lib/server/supabase';
import { parseBoolean } from '$lib/server/http';
import type { PageServerLoad } from './$types';
import type { Actions } from './$types';

async function requireAdminAccess(locals: App.Locals, cookies: import('@sveltejs/kit').Cookies) {
	const user = locals.user;
	if (!user) {
		throw redirect(303, '/login?redirect_to=%2Fadmin');
	}

	const accessToken = getAccessTokenFromCookies(cookies);
	if (!accessToken) {
		throw redirect(303, '/login?redirect_to=%2Fadmin');
	}

	const canAccessAdmin = await isUserAdmin(user.id, accessToken, Boolean(user.isAdmin));
	if (!canAccessAdmin) {
		throw redirect(303, '/dashboard');
	}

	return { user, accessToken };
}

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const { user, accessToken } = await requireAdminAccess(locals, cookies);

	const users = await listAdminUsers(accessToken, { limit: 100 });
	const requestedUserId = url.searchParams.get('user_id')?.trim() ?? '';
	const selectedUserId =
		users.find((row) => row.userId === requestedUserId)?.userId ?? users[0]?.userId ?? null;
	const selectedUser = selectedUserId ? await getAdminUserDetail(selectedUserId, accessToken) : null;

	const emailByUserId: Record<string, string | null> = {};
	for (const row of users) {
		emailByUserId[row.userId] = await getAdminUserEmail(row.userId);
	}

	let selectedProviders: string[] = [];
	if (selectedUserId === user.id) {
		const providers = await getLinkedProviders(accessToken);
		selectedProviders = providers.map((provider) => provider.provider);
	} else if (selectedUserId) {
		const providers = await getAdminUserProviders(selectedUserId);
		selectedProviders = (providers ?? []).map((provider) => provider.provider);
	}

	return {
		users,
		emailByUserId,
		selectedUser,
		selectedUserId,
		selectedProviders
	};
};

export const actions: Actions = {
	selectUser: async ({ locals, cookies, request }) => {
		await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		if (!userId) {
			return fail(400, { actionMessage: 'User selection is required.' });
		}

		throw redirect(303, `/admin?user_id=${encodeURIComponent(userId)}`);
	},
	refreshUsage: async ({ locals, cookies, request }) => {
		await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		if (!userId) {
			return fail(400, { actionMessage: 'User ID is required.' });
		}

		return { actionMessage: `Usage refreshed for ${userId}.` };
	},
	rollApiKey: async ({ locals, cookies, request }) => {
		const { accessToken } = await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		if (!userId) {
			return fail(400, { actionMessage: 'User ID is required.' });
		}

		try {
			await rollApiKey(userId, accessToken);
			return { actionMessage: `Rolled API key for ${userId}.` };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to roll API key.';
			return fail(400, { actionMessage: message });
		}
	},
	setApiKeyDisabled: async ({ locals, cookies, request }) => {
		const { accessToken } = await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		const disabled = parseBoolean(String(formData.get('disabled') ?? 'true'), true);

		if (!userId) {
			return fail(400, { actionMessage: 'User ID is required.' });
		}

		try {
			await setApiKeyDisabled(userId, accessToken, disabled);
			return { actionMessage: disabled ? `Disabled API key for ${userId}.` : `Enabled API key for ${userId}.` };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update API key.';
			return fail(400, { actionMessage: message });
		}
	},
	revokeProvider: async ({ locals, cookies, request }) => {
		const { user, accessToken } = await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		const provider = String(formData.get('provider') ?? '').trim().toLowerCase();

		if (!userId || !provider) {
			return fail(400, { actionMessage: 'User ID and provider are required.' });
		}

		try {
			if (user.id === userId) {
				const revoked = await revokeLinkedProvider(accessToken, provider);
				if (!revoked) {
					return fail(400, {
						actionMessage: `${getProviderDisplayName(provider)} is not linked.`
					});
				}
			} else {
				const revoked = await revokeProviderForUser(userId, provider);
				if (revoked === null) {
					return fail(400, {
						actionMessage:
							'Provider revocation for other users requires SUPABASE_SERVICE_ROLE_KEY.'
					});
				}

				if (!revoked) {
					return fail(400, {
						actionMessage: `${getProviderDisplayName(provider)} is not linked.`
					});
				}
			}

			return { actionMessage: `Revoked ${getProviderDisplayName(provider)} for ${userId}.` };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to revoke provider.';
			return fail(400, { actionMessage: message });
		}
	},
	setUserBanned: async ({ locals, cookies, request }) => {
		const { accessToken } = await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		const banned = parseBoolean(String(formData.get('banned') ?? 'true'), true);

		if (!userId) {
			return fail(400, { actionMessage: 'User ID is required.' });
		}

		try {
			await setUserBanned(userId, accessToken, banned);
			return { actionMessage: banned ? `Banned ${userId}.` : `Unbanned ${userId}.` };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update ban state.';
			return fail(400, { actionMessage: message });
		}
	},
	deleteAccount: async ({ locals, cookies, request }) => {
		const { accessToken } = await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();

		if (!userId) {
			return fail(400, { actionMessage: 'User ID is required.' });
		}

		try {
			await deactivateUserAccount(userId, accessToken);
			return { actionMessage: `Deactivated ${userId}.` };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to deactivate account.';
			return fail(400, { actionMessage: message });
		}
	}
};
