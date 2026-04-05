import { createSupabaseAuthedClient } from '$lib/server/supabase';
import type { SupabaseSessionUser } from '$lib/server/supabase';
import type { DashboardSnapshot } from '$lib/server/oidc';
import { getOpenRouterUsage } from '$lib/server/openrouter';
import { env } from '$env/dynamic/private';

export const BANNED_ACCOUNT_MESSAGE = `Your account is banned. Please contact support to appeal this ban: ${env.SUPPORT_EMAIL?.trim() || 'support@example.com'}`;

interface UserProfileRow {
	user_id?: string;
	preferred_name: string | null;
	is_admin: boolean;
	banned: boolean;
}

interface UserAccountRow {
	user_id?: string;
	api_key_hash: string | null;
	allowed_usage_usd: string | number | null;
	usage_carried_forward_usd: string | number | null;
	api_key_disabled: boolean | null;
}

export interface AdminUserRow {
	userId: string;
	preferredName: string | null;
	isAdmin: boolean;
	banned: boolean;
	allowedUsageUsd: number;
	usageCarriedForwardUsd: number;
	apiKeyDisabled: boolean;
	apiKeyAssigned: boolean;
}

export interface AdminUserDetail extends AdminUserRow {
	currentUsageUsd: number;
}

interface CompleteOnboardingInput {
	user: SupabaseSessionUser;
	accessToken: string;
	preferredName: string;
}

function toNumber(value: string | number | null | undefined): number {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : 0;
	}

	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeAdminSearch(value: string | undefined): string | null {
	if (!value) {
		return null;
	}

	const trimmed = value.trim().slice(0, 120);
	const normalized = trimmed.replace(/[^a-zA-Z0-9@.\-_ ]/g, '');
	if (!normalized) {
		return null;
	}

	// Strip wildcard operators to keep ILIKE matching predictable.
	return normalized.replace(/[%*]/g, '');
}

function isApiKeyAssigned(
	apiKeyHash: string | null | undefined,
	apiKeyDisabled: boolean | null | undefined
): boolean {
	if (apiKeyDisabled == null) {
		return false;
	}

	return Boolean(apiKeyHash && apiKeyHash.trim().length > 0);
}

function generateApiKeyValue() {
	return `nawab_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function ensureUserProfileRecord(userId: string, accessToken: string) {
	const client = createSupabaseAuthedClient(accessToken);
	const { error } = await client.from('user_profiles').upsert({
		user_id: userId,
		preferred_name: null,
		is_admin: false,
		banned: false
	}, { onConflict: 'user_id' });

	if (error) {
		throw new Error(error.message);
	}
}

async function ensureUserAccountRecord(userId: string, accessToken: string) {
	const client = createSupabaseAuthedClient(accessToken);
	const { error } = await client.from('user_accounts').upsert({
		user_id: userId,
		api_key_hash: null,
		allowed_usage_usd: 0,
		usage_carried_forward_usd: 0,
		api_key_disabled: false
	}, { onConflict: 'user_id' });

	if (error) {
		throw new Error(error.message);
	}
}

async function getCurrentUsageUsd(apiKeyHash: string | null | undefined, apiKeyDisabled: boolean | null | undefined): Promise<number> {
	if (!apiKeyHash || apiKeyDisabled) {
		return 0;
	}

	const usage = await getOpenRouterUsage(apiKeyHash);
	return usage?.totalUsageUsd ?? 0;
}

export async function isUserOnboarded(userId: string, accessToken: string | null): Promise<boolean> {
	if (!accessToken) {
		return false;
	}

	const client = createSupabaseAuthedClient(accessToken);
	const [profileResult, accountResult] = await Promise.all([
		client.from('user_profiles').select('user_id').eq('user_id', userId).maybeSingle(),
		client.from('user_accounts').select('user_id').eq('user_id', userId).maybeSingle()
	]);

	if (profileResult.error || accountResult.error) {
		return false;
	}

	return Boolean(profileResult.data?.user_id && accountResult.data?.user_id);
}

export async function isUserBanned(userId: string, accessToken: string | null): Promise<boolean> {
	if (!accessToken) {
		return false;
	}

	const client = createSupabaseAuthedClient(accessToken);
	const { data, error } = await client
		.from('user_profiles')
		.select('banned')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(error.message);
	}

	return Boolean(data?.banned);
}

export async function isUserAdmin(
	userId: string,
	accessToken: string | null,
	fallback = false
): Promise<boolean> {
	if (!accessToken) {
		return fallback;
	}

	const client = createSupabaseAuthedClient(accessToken);
	const { data, error } = await client
		.from('user_profiles')
		.select('is_admin')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(error.message);
	}

	if (!data) {
		return fallback;
	}

	return Boolean(data.is_admin);
}

export async function completeUserOnboarding(input: CompleteOnboardingInput) {
	const client = createSupabaseAuthedClient(input.accessToken);
	const preferredName = input.preferredName.trim();

	const profilePayload = {
		user_id: input.user.id,
		preferred_name: preferredName
	};

	const accountPayload = {
		user_id: input.user.id,
		allowed_usage_usd: 0,
		usage_carried_forward_usd: 0,
		api_key_disabled: false
	};

	const { error: profileError } = await client
		.from('user_profiles')
		.upsert(profilePayload, { onConflict: 'user_id' });

	if (profileError) {
		throw new Error(profileError.message);
	}

	const { error: accountError } = await client
		.from('user_accounts')
		.upsert(accountPayload, { onConflict: 'user_id' });

	if (accountError) {
		throw new Error(accountError.message);
	}
}

export async function getDashboardSnapshot(
	user: SupabaseSessionUser,
	accessToken: string | null
): Promise<DashboardSnapshot> {
	if (!accessToken) {
		return {
			userId: user.id,
			email: user.email,
			emailVerified: user.emailVerified,
			locale: 'en',
			isAdmin: Boolean(user.isAdmin),
			preferredName: user.name,
			allowedUsageUsd: 0,
			usageCarriedForwardUsd: 0,
			currentUsageUsd: 0,
			apiKeyAssigned: false,
			apiKeyDisabled: false,
			rolledKeyIds: []
		};
	}

	const client = createSupabaseAuthedClient(accessToken);
	const [profileResult, accountResult] = await Promise.all([
		client.from('user_profiles').select('preferred_name,is_admin,banned').eq('user_id', user.id).maybeSingle(),
		client
			.from('user_accounts')
			.select('api_key_hash,allowed_usage_usd,usage_carried_forward_usd,api_key_disabled')
			.eq('user_id', user.id)
			.maybeSingle()
	]);

	const profile = (profileResult.data ?? null) as UserProfileRow | null;
	const account = (accountResult.data ?? null) as UserAccountRow | null;

	const currentUsageUsd = await getCurrentUsageUsd(account?.api_key_hash, account?.api_key_disabled);
	
	return {
		userId: user.id,
		email: user.email,
		emailVerified: user.emailVerified,
		locale: 'en',
		isAdmin: profile?.is_admin ?? Boolean(user.isAdmin),
		preferredName: profile?.preferred_name ?? user.name,
		allowedUsageUsd: toNumber(account?.allowed_usage_usd),
		usageCarriedForwardUsd: toNumber(account?.usage_carried_forward_usd),
		currentUsageUsd,
		apiKeyAssigned: isApiKeyAssigned(account?.api_key_hash, account?.api_key_disabled),
		apiKeyDisabled: account?.api_key_disabled ?? false,
		rolledKeyIds: []
	};
}

export async function listAdminUsers(
	accessToken: string,
	input: { limit?: number; search?: string } = {}
): Promise<AdminUserRow[]> {
	const client = createSupabaseAuthedClient(accessToken);
	const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
	const search = sanitizeAdminSearch(input.search);

	let profileQuery = client
		.from('user_profiles')
		.select('user_id,preferred_name,is_admin,banned')
		.limit(limit);

	if (search) {
		profileQuery = profileQuery.or(`user_id.ilike.%${search}%,preferred_name.ilike.%${search}%`);
	}

	const { data: profilesData, error: profileError } = await profileQuery;
	if (profileError) {
		throw new Error(profileError.message);
	}

	const profiles = (profilesData ?? []) as UserProfileRow[];
	if (profiles.length === 0) {
		return [];
	}

	const userIds = profiles
		.map((profile) => profile.user_id)
		.filter((userId): userId is string => Boolean(userId));

	const { data: accountData, error: accountError } = await client
		.from('user_accounts')
		.select('user_id,api_key_hash,allowed_usage_usd,usage_carried_forward_usd,api_key_disabled')
		.in('user_id', userIds);

	if (accountError) {
		throw new Error(accountError.message);
	}

	const accountByUserId = new Map<string, UserAccountRow>();
	for (const account of (accountData ?? []) as UserAccountRow[]) {
		if (account.user_id) {
			accountByUserId.set(account.user_id, account);
		}
	}

	return profiles.map((profile) => {
		const userId = profile.user_id ?? '';
		const account = accountByUserId.get(userId);

		return {
			userId,
			preferredName: profile.preferred_name,
			isAdmin: profile.is_admin,
			banned: profile.banned,
			allowedUsageUsd: toNumber(account?.allowed_usage_usd),
			usageCarriedForwardUsd: toNumber(account?.usage_carried_forward_usd),
			apiKeyDisabled: account?.api_key_disabled ?? false,
			apiKeyAssigned: isApiKeyAssigned(account?.api_key_hash, account?.api_key_disabled)
		};
	});
}

export async function getAdminUserDetail(
	userId: string,
	accessToken: string
): Promise<AdminUserDetail | null> {
	const client = createSupabaseAuthedClient(accessToken);
	const [profileResult, accountResult] = await Promise.all([
		client
			.from('user_profiles')
			.select('preferred_name,is_admin,banned')
			.eq('user_id', userId)
			.maybeSingle(),
		client
			.from('user_accounts')
			.select('api_key_hash,allowed_usage_usd,usage_carried_forward_usd,api_key_disabled')
			.eq('user_id', userId)
			.maybeSingle()
	]);

	if (profileResult.error) {
		throw new Error(profileResult.error.message);
	}

	if (!profileResult.data) {
		return null;
	}

	if (accountResult.error) {
		throw new Error(accountResult.error.message);
	}

	const profile = profileResult.data as UserProfileRow;
	const account = (accountResult.data ?? null) as UserAccountRow | null;

	const currentUsageUsd = await getCurrentUsageUsd(account?.api_key_hash, account?.api_key_disabled);

	return {
		userId,
		preferredName: profile.preferred_name,
		isAdmin: profile.is_admin,
		banned: profile.banned,
		allowedUsageUsd: toNumber(account?.allowed_usage_usd),
		usageCarriedForwardUsd: toNumber(account?.usage_carried_forward_usd),
		apiKeyDisabled: account?.api_key_disabled ?? false,
		apiKeyAssigned: isApiKeyAssigned(account?.api_key_hash, account?.api_key_disabled),
		currentUsageUsd
	};
}

export async function rollApiKey(userId: string, accessToken: string) {
	await ensureUserAccountRecord(userId, accessToken);
	const apiKeyHash = generateApiKeyValue();
	const client = createSupabaseAuthedClient(accessToken);

	const { error } = await client
		.from('user_accounts')
		.update({ api_key_hash: apiKeyHash })
		.eq('user_id', userId);

	if (error) {
		throw new Error(error.message);
	}

	return apiKeyHash;
}

export async function setApiKeyDisabled(userId: string, accessToken: string, disabled: boolean) {
	await ensureUserAccountRecord(userId, accessToken);
	const client = createSupabaseAuthedClient(accessToken);

	const { error } = await client
		.from('user_accounts')
		.update({ api_key_disabled: disabled })
		.eq('user_id', userId);

	if (error) {
		throw new Error(error.message);
	}
}

export async function setUserBanned(userId: string, accessToken: string, banned: boolean) {
	await ensureUserProfileRecord(userId, accessToken);
	const client = createSupabaseAuthedClient(accessToken);

	const { error } = await client.from('user_profiles').update({ banned }).eq('user_id', userId);

	if (error) {
		throw new Error(error.message);
	}
}

export async function deactivateUserAccount(userId: string, accessToken: string) {
	await ensureUserProfileRecord(userId, accessToken);
	await ensureUserAccountRecord(userId, accessToken);

	const client = createSupabaseAuthedClient(accessToken);
	const [{ error: profileError }, { error: accountError }] = await Promise.all([
		client.from('user_profiles').update({ banned: true }).eq('user_id', userId),
		client
			.from('user_accounts')
			.update({
				api_key_hash: null,
				api_key_disabled: true,
				allowed_usage_usd: 0,
				usage_carried_forward_usd: 0
			})
			.eq('user_id', userId)
	]);

	if (profileError) {
		throw new Error(profileError.message);
	}

	if (accountError) {
		throw new Error(accountError.message);
	}
}
