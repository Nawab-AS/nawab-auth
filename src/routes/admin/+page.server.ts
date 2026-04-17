import { fail, redirect } from '@sveltejs/kit';
import {
	getAdminUserDetail,
	isUserAdmin,
	listAdminUsers,
	deleteUserAccountPermanently,
	rollApiKey,
	setApiKeyDisabled,
	setUsageLimitUsd,
	setUserState,
	type UserState
} from '$lib/server/account';
import { getProviderDisplayName } from '$lib/server/oauth-settings';
import { getLinkedProviders, revokeLinkedProvider } from '$lib/server/providers';
import { getAdminUserEmail, getAdminUserProviders, revokeProviderForUser } from '$lib/server/admin-auth';
import { sendVerificationEmail } from '$lib/server/mail';
import { getErrorMessage, parseBoolean } from '$lib/server/http';
import { getAccessTokenFromCookies } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';
import type { Actions } from './$types';

function parseUserState(value: string): UserState | null {
	if (value === 'unverified' || value === 'verified' || value === 'admin' || value === 'banned') {
		return value;
	}

	return null;
}

function failAction(message: string) {
	return fail(400, { actionMessage: message });
}

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
			return failAction('User selection is required.');
		}

		throw redirect(303, `/admin?user_id=${encodeURIComponent(userId)}`);
	},
	refreshUsage: async ({ locals, cookies, request }) => {
		await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		if (!userId) {
			return failAction('User ID is required.');
		}

		return { actionMessage: `Usage refreshed for ${userId}.` };
	},
	rollApiKey: async ({ locals, cookies, request }) => {
		const { accessToken } = await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		if (!userId) {
			return failAction('User ID is required.');
		}

		try {
			await rollApiKey(userId, accessToken);
			return { actionMessage: `Rolled API key for ${userId}.` };
		} catch (error) {
			return failAction(getErrorMessage(error, 'Failed to roll API key.'));
		}
	},
	setApiKeyDisabled: async ({ locals, cookies, request }) => {
		const { accessToken } = await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		const disabled = parseBoolean(String(formData.get('disabled') ?? 'true'), true);

		if (!userId) {
			return failAction('User ID is required.');
		}

		try {
			await setApiKeyDisabled(userId, accessToken, disabled);
			return { actionMessage: disabled ? `Disabled API key for ${userId}.` : `Enabled API key for ${userId}.` };
		} catch (error) {
			return failAction(getErrorMessage(error, 'Failed to update API key.'));
		}
	}, 
	revokeProvider: async ({ locals, cookies, request }) => {
		const { user, accessToken } = await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		const provider = String(formData.get('provider') ?? '').trim().toLowerCase();

		if (!userId || !provider) {
			return failAction('User ID and provider are required.');
		}

		try {
			if (user.id === userId) {
				const revoked = await revokeLinkedProvider(accessToken, provider);
				if (!revoked) {
					return failAction(`${getProviderDisplayName(provider)} is not linked.`);
				}
			} else {
				const revoked = await revokeProviderForUser(userId, provider);
				if (revoked === null) {
					return failAction('Provider revocation for other users requires SUPABASE_SERVICE_ROLE_KEY.');
				}

				if (!revoked) {
					return failAction(`${getProviderDisplayName(provider)} is not linked.`);
				}
			}

			return { actionMessage: `Revoked ${getProviderDisplayName(provider)} for ${userId}.` };
		} catch (error) {
			return failAction(getErrorMessage(error, 'Failed to revoke provider.'));
		}
	},
	setUserState: async ({ locals, cookies, request }) => {
		const { accessToken } = await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		const nextState = parseUserState(String(formData.get('userState') ?? '').trim());

		if (!userId) {
			return failAction('User ID is required.');
		}

		if (!nextState) {
			return failAction('A valid user state is required.');
		}

		try {
			const previousUser = await getAdminUserDetail(userId, accessToken);
			const wasVerified = Boolean(previousUser?.isVerified);
			await setUserState(userId, accessToken, nextState);

			if (!wasVerified && (nextState === 'verified' || nextState === 'admin')) {
				const email = await getAdminUserEmail(userId);
				if (email) {
					await sendVerificationEmail({
						to: email,
						preferredName: previousUser?.preferredName ?? null
					});
				}
			}

			return { actionMessage: `Updated ${userId} to ${nextState}.` };
		} catch (error) {
			return failAction(getErrorMessage(error, 'Failed to update user state.'));
		}
	},
	setUsageLimit: async ({ locals, cookies, request }) => {
		const { accessToken } = await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();
		const limitValue = Number(String(formData.get('allowedUsageUsd') ?? '').trim());

		if (!userId) {
			return failAction('User ID is required.');
		}

		if (!Number.isFinite(limitValue) || limitValue < 0) {
			return failAction('Usage limit must be a non-negative number.');
		}

		try {
			await setUsageLimitUsd(userId, accessToken, limitValue);
			return { actionMessage: `Updated usage limit for ${userId}.` };
		} catch (error) {
			return failAction(getErrorMessage(error, 'Failed to update usage limit.'));
		}
	},
	deleteAccount: async ({ locals, cookies, request }) => {
		await requireAdminAccess(locals, cookies);

		const formData = await request.formData();
		const userId = String(formData.get('userId') ?? '').trim();

		if (!userId) {
			return failAction('User ID is required.');
		}

		try {
			await deleteUserAccountPermanently(userId);
			return { actionMessage: `Permanently deleted ${userId} and removed associated data.` };
		} catch (error) {
			return failAction(getErrorMessage(error, 'Failed to permanently delete account.'));
		}
	}
};
