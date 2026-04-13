import { createSupabaseAuthedClient } from '$lib/server/supabase';
import type { SupabaseSessionUser } from '$lib/server/supabase';
import type { DashboardSnapshot } from '$lib/server/oidc';
import { getOpenRouterUsage } from '$lib/server/openrouter';
import { env } from '$env/dynamic/private';

export const BANNED_ACCOUNT_MESSAGE = `Your account is banned. Please contact support to appeal this ban: ${env.SUPPORT_EMAIL?.trim() || 'support@example.com'}`;

export const USER_STATES = ['unverified', 'verified', 'admin', 'banned'] as const;
export type UserState = (typeof USER_STATES)[number];

const textEncoder = new TextEncoder();

interface UserProfileRow {
	user_id?: string;
	preferred_name: string | null;
	user_state: UserState;
	first_sso_completed: boolean;
	onboarding_video_watched: boolean;
}

interface UserAccountRow {
	user_id?: string;
	api_key_hash: string | null;
	api_key_secret: string | null;
	api_key_fingerprint: string | null;
	allowed_usage_usd: string | number | null;
	usage_carried_forward_usd: string | number | null;
	provisioned_usage_limit_usd: string | number | null;
	api_key_disabled: boolean | null;
}

export interface AdminUserRow {
	userId: string;
	preferredName: string | null;
	userState: UserState;
	isAdmin: boolean;
	isVerified: boolean;
	banned: boolean;
	allowedUsageUsd: number;
	usageCarriedForwardUsd: number;
	apiKeyDisabled: boolean;
	apiKeyAssigned: boolean;
}

export interface AdminUserDetail extends AdminUserRow {
	currentUsageUsd: number;
	apiKeyFingerprint: string | null;
}

interface ApiKeyRollResult {
	keyValue: string;
	fingerprint: string;
	hash: string;
}

export interface ProvisionResult {
	created: boolean;
	apiKey: string | null;
}

interface UserSsoState {
	userState: UserState;
	isVerified: boolean;
	firstSsoCompleted: boolean;
	videoWatched: boolean;
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
	apiKeySecret: string | null | undefined,
	apiKeyDisabled: boolean | null | undefined
): boolean {
	if (apiKeyDisabled == null) {
		return false;
	}

	return Boolean(apiKeySecret && apiKeySecret.trim().length > 0);
}

function generateApiKeyValue() {
	return `nawab_${crypto.randomUUID().replace(/-/g, '')}`;
}

function computeProvisionedUsageLimit(allowedUsageUsd: number, carriedForwardUsd: number): number {
	return Math.max(allowedUsageUsd - carriedForwardUsd, 0);
}

function isKnownUserState(value: string | null | undefined): value is UserState {
	return (USER_STATES as readonly string[]).includes(value ?? '');
}

function toUserState(value: string | null | undefined): UserState {
	if (isKnownUserState(value)) {
		return value;
	}

	return 'unverified';
}

function isUserStateAdmin(userState: UserState): boolean {
	return userState === 'admin';
}

function isUserStateBanned(userState: UserState): boolean {
	return userState === 'banned';
}

function isUserStateVerified(userState: UserState): boolean {
	return userState === 'verified' || userState === 'admin';
}

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashApiKey(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
	return toHex(new Uint8Array(digest));
}

async function buildApiKeyRollResult(value: string): Promise<ApiKeyRollResult> {
	const hash = await hashApiKey(value);
	return {
		keyValue: value,
		fingerprint: hash.slice(0, 12),
		hash
	};
}

async function getUserStateById(userId: string, accessToken: string): Promise<UserState | null> {
	const client = createSupabaseAuthedClient(accessToken);
	const { data, error } = await client
		.from('user_profiles')
		.select('user_state')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(error.message);
	}

	if (!data) {
		return null;
	}

	return toUserState(data.user_state);
}

export async function getUserSsoState(userId: string, accessToken: string): Promise<UserSsoState> {
	const client = createSupabaseAuthedClient(accessToken);
	const { data, error } = await client
		.from('user_profiles')
		.select('user_state,first_sso_completed,onboarding_video_watched')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(error.message);
	}

	const userState = toUserState(data?.user_state);

	return {
		userState,
		isVerified: isUserStateVerified(userState),
		firstSsoCompleted: Boolean(data?.first_sso_completed),
		videoWatched: Boolean(data?.onboarding_video_watched)
	};
}

async function ensureUserVerified(userId: string, accessToken: string) {
	const userState = await getUserStateById(userId, accessToken);
	if (!userState || !isUserStateVerified(userState)) {
		throw new Error('Your account is not verified yet. Ask an admin to verify your account first.');
	}
}

async function ensureUserProfileRecord(userId: string, accessToken: string) {
	const client = createSupabaseAuthedClient(accessToken);
	const { error } = await client.from('user_profiles').upsert({
		user_id: userId,
		preferred_name: null,
		user_state: 'unverified',
		first_sso_completed: false,
		onboarding_video_watched: false
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
		api_key_secret: null,
		api_key_fingerprint: null,
		allowed_usage_usd: 0,
		usage_carried_forward_usd: 0,
		provisioned_usage_limit_usd: 0,
		api_key_disabled: false
	}, { onConflict: 'user_id' });

	if (error) {
		throw new Error(error.message);
	}
}

async function getCurrentUsageUsd(apiKeySecret: string | null | undefined, apiKeyDisabled: boolean | null | undefined): Promise<number> {
	if (!apiKeySecret || apiKeyDisabled) {
		return 0;
	}

	const usage = await getOpenRouterUsage(apiKeySecret);
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
		.select('user_state')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(error.message);
	}

	return isUserStateBanned(toUserState(data?.user_state));
}

export async function isUserVerified(userId: string, accessToken: string | null): Promise<boolean> {
	if (!accessToken) {
		return false;
	}

	const userState = await getUserStateById(userId, accessToken);
	if (!userState) {
		return false;
	}

	return isUserStateVerified(userState);
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
		.select('user_state')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(error.message);
	}

	if (!data) {
		return fallback;
	}

	return isUserStateAdmin(toUserState(data.user_state));
}

export async function completeUserOnboarding(input: CompleteOnboardingInput) {
	const client = createSupabaseAuthedClient(input.accessToken);
	const preferredName = input.preferredName.trim();

	const profilePayload = {
		user_id: input.user.id,
		preferred_name: preferredName,
		user_state: 'unverified',
		first_sso_completed: false,
		onboarding_video_watched: false
	};

	const accountPayload = {
		user_id: input.user.id,
		api_key_hash: null,
		api_key_secret: null,
		api_key_fingerprint: null,
		allowed_usage_usd: 0,
		usage_carried_forward_usd: 0,
		provisioned_usage_limit_usd: 0,
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

/**
 * Get user's preferred name from database (used in OIDC tokens)
 */
export async function getUserPreferredName(
	userId: string,
	accessToken: string,
	fallback: string = ''
): Promise<string> {
	try {
		const client = createSupabaseAuthedClient(accessToken);
		const { data, error } = await client
			.from('user_profiles')
			.select('preferred_name')
			.eq('user_id', userId)
			.maybeSingle();

		if (error) {
			console.warn(`Failed to fetch preferred name for user ${userId}:`, error);
			return fallback;
		}

		const profile = data as UserProfileRow | null;
		return profile?.preferred_name ?? fallback;
	} catch (err) {
		console.warn(`Error getting preferred name for user ${userId}:`, err);
		return fallback;
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
			isVerified: false,
			userState: 'unverified',
			preferredName: user.name,
			allowedUsageUsd: 0,
			usageCarriedForwardUsd: 0,
			currentUsageUsd: 0,
			apiKeyFingerprint: null,
			apiKeyAssigned: false,
			apiKeyDisabled: false,
			rolledKeyIds: []
		};
	}

	const client = createSupabaseAuthedClient(accessToken);
	const [profileResult, accountResult] = await Promise.all([
		client
			.from('user_profiles')
			.select('preferred_name,user_state,first_sso_completed,onboarding_video_watched')
			.eq('user_id', user.id)
			.maybeSingle(),
		client
			.from('user_accounts')
			.select('api_key_hash,api_key_secret,api_key_fingerprint,allowed_usage_usd,usage_carried_forward_usd,provisioned_usage_limit_usd,api_key_disabled')
			.eq('user_id', user.id)
			.maybeSingle()
	]);

	const profile = (profileResult.data ?? null) as UserProfileRow | null;
	const account = (accountResult.data ?? null) as UserAccountRow | null;

	const userState = toUserState(profile?.user_state);
	const currentUsageUsd = await getCurrentUsageUsd(account?.api_key_secret, account?.api_key_disabled);
	
	return {
		userId: user.id,
		email: user.email,
		emailVerified: user.emailVerified,
		locale: 'en',
		isAdmin: isUserStateAdmin(userState) || Boolean(user.isAdmin),
		isVerified: isUserStateVerified(userState),
		userState,
		preferredName: profile?.preferred_name ?? user.name,
		allowedUsageUsd: toNumber(account?.allowed_usage_usd),
		usageCarriedForwardUsd: toNumber(account?.usage_carried_forward_usd),
		currentUsageUsd,
		apiKeyFingerprint: account?.api_key_fingerprint ?? null,
		apiKeyAssigned: isApiKeyAssigned(account?.api_key_secret, account?.api_key_disabled),
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
		.select('user_id,preferred_name,user_state,first_sso_completed,onboarding_video_watched')
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
		.select('user_id,api_key_hash,api_key_secret,api_key_fingerprint,allowed_usage_usd,usage_carried_forward_usd,provisioned_usage_limit_usd,api_key_disabled')
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
		const userState = toUserState(profile.user_state);

		return {
			userId,
			preferredName: profile.preferred_name,
			userState,
			isAdmin: isUserStateAdmin(userState),
			isVerified: isUserStateVerified(userState),
			banned: isUserStateBanned(userState),
			allowedUsageUsd: toNumber(account?.allowed_usage_usd),
			usageCarriedForwardUsd: toNumber(account?.usage_carried_forward_usd),
			apiKeyDisabled: account?.api_key_disabled ?? false,
			apiKeyAssigned: isApiKeyAssigned(account?.api_key_secret, account?.api_key_disabled)
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
			.select('preferred_name,user_state,first_sso_completed,onboarding_video_watched')
			.eq('user_id', userId)
			.maybeSingle(),
		client
			.from('user_accounts')
			.select('api_key_hash,api_key_secret,api_key_fingerprint,allowed_usage_usd,usage_carried_forward_usd,provisioned_usage_limit_usd,api_key_disabled')
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
	const userState = toUserState(profile.user_state);

	const currentUsageUsd = await getCurrentUsageUsd(account?.api_key_secret, account?.api_key_disabled);

	return {
		userId,
		preferredName: profile.preferred_name,
		userState,
		isAdmin: isUserStateAdmin(userState),
		isVerified: isUserStateVerified(userState),
		banned: isUserStateBanned(userState),
		allowedUsageUsd: toNumber(account?.allowed_usage_usd),
		usageCarriedForwardUsd: toNumber(account?.usage_carried_forward_usd),
		apiKeyFingerprint: account?.api_key_fingerprint ?? null,
		apiKeyDisabled: account?.api_key_disabled ?? false,
		apiKeyAssigned: isApiKeyAssigned(account?.api_key_secret, account?.api_key_disabled),
		currentUsageUsd
	};
}

export async function rollApiKey(userId: string, accessToken: string) {
	await ensureUserVerified(userId, accessToken);
	await ensureUserAccountRecord(userId, accessToken);
	const roll = await buildApiKeyRollResult(generateApiKeyValue());
	const client = createSupabaseAuthedClient(accessToken);

	const { error } = await client
		.from('user_accounts')
		.update({
			api_key_secret: roll.keyValue,
			api_key_hash: roll.hash,
			api_key_fingerprint: roll.fingerprint,
			api_key_disabled: false
		})
		.eq('user_id', userId);

	if (error) {
		throw new Error(error.message);
	}

	return roll.keyValue;
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
	const state = banned ? 'banned' : 'verified';
	await setUserState(userId, accessToken, state);
}

export async function setUserState(userId: string, accessToken: string, userState: UserState) {
	await ensureUserProfileRecord(userId, accessToken);
	const client = createSupabaseAuthedClient(accessToken);
	const { error } = await client
		.from('user_profiles')
		.update({ user_state: userState })
		.eq('user_id', userId);

	if (error) {
		throw new Error(error.message);
	}
}

export async function setUsageLimitUsd(userId: string, accessToken: string, allowedUsageUsd: number) {
	if (!Number.isFinite(allowedUsageUsd) || allowedUsageUsd < 0) {
		throw new Error('Usage limit must be a non-negative number.');
	}

	await ensureUserAccountRecord(userId, accessToken);
	const client = createSupabaseAuthedClient(accessToken);
	const { error } = await client
		.from('user_accounts')
		.update({ allowed_usage_usd: allowedUsageUsd })
		.eq('user_id', userId);

	if (error) {
		throw new Error(error.message);
	}
}

export async function markOnboardingVideoWatched(userId: string, accessToken: string) {
	await ensureUserProfileRecord(userId, accessToken);
	const client = createSupabaseAuthedClient(accessToken);
	const { error } = await client
		.from('user_profiles')
		.update({ onboarding_video_watched: true })
		.eq('user_id', userId);

	if (error) {
		throw new Error(error.message);
	}
}

export async function provisionApiKeyForFirstSso(userId: string, accessToken: string): Promise<ProvisionResult> {
	await ensureUserVerified(userId, accessToken);
	await ensureUserProfileRecord(userId, accessToken);
	await ensureUserAccountRecord(userId, accessToken);

	const client = createSupabaseAuthedClient(accessToken);
	const [profileResult, accountResult] = await Promise.all([
		client
			.from('user_profiles')
			.select('first_sso_completed')
			.eq('user_id', userId)
			.maybeSingle(),
		client
			.from('user_accounts')
			.select('api_key_secret,allowed_usage_usd,usage_carried_forward_usd')
			.eq('user_id', userId)
			.maybeSingle()
	]);

	if (profileResult.error) {
		throw new Error(profileResult.error.message);
	}

	if (accountResult.error) {
		throw new Error(accountResult.error.message);
	}

	const alreadyCompleted = Boolean(profileResult.data?.first_sso_completed);
	const existingApiKey = accountResult.data?.api_key_secret?.trim() ?? '';
	if (alreadyCompleted && existingApiKey) {
		return { created: false, apiKey: null };
	}

	if (existingApiKey) {
		const provisionedLimit = computeProvisionedUsageLimit(
			toNumber(accountResult.data?.allowed_usage_usd),
			toNumber(accountResult.data?.usage_carried_forward_usd)
		);
		const { error: profileUpdateError } = await client
			.from('user_profiles')
			.update({ first_sso_completed: true })
			.eq('user_id', userId);

		const { error: accountUpdateError } = await client
			.from('user_accounts')
			.update({ provisioned_usage_limit_usd: provisionedLimit })
			.eq('user_id', userId);

		if (profileUpdateError) {
			throw new Error(profileUpdateError.message);
		}

		if (accountUpdateError) {
			throw new Error(accountUpdateError.message);
		}

		return { created: false, apiKey: null };
	}

	const roll = await buildApiKeyRollResult(generateApiKeyValue());
	const provisionedLimit = computeProvisionedUsageLimit(
		toNumber(accountResult.data?.allowed_usage_usd),
		toNumber(accountResult.data?.usage_carried_forward_usd)
	);

	const [{ error: accountUpdateError }, { error: profileUpdateError }] = await Promise.all([
		client
			.from('user_accounts')
			.update({
				api_key_secret: roll.keyValue,
				api_key_hash: roll.hash,
				api_key_fingerprint: roll.fingerprint,
				provisioned_usage_limit_usd: provisionedLimit,
				api_key_disabled: false
			})
			.eq('user_id', userId),
		client
			.from('user_profiles')
			.update({ first_sso_completed: true })
			.eq('user_id', userId)
	]);

	if (accountUpdateError) {
		throw new Error(accountUpdateError.message);
	}

	if (profileUpdateError) {
		throw new Error(profileUpdateError.message);
	}

	return { created: true, apiKey: roll.keyValue };
}

export async function deactivateUserAccount(userId: string, accessToken: string) {
	await ensureUserProfileRecord(userId, accessToken);
	await ensureUserAccountRecord(userId, accessToken);

	const client = createSupabaseAuthedClient(accessToken);
	const [{ error: profileError }, { error: accountError }] = await Promise.all([
		client.from('user_profiles').update({ user_state: 'banned' }).eq('user_id', userId),
		client
			.from('user_accounts')
			.update({
				api_key_hash: null,
				api_key_secret: null,
				api_key_fingerprint: null,
				api_key_disabled: true,
				allowed_usage_usd: 0,
				usage_carried_forward_usd: 0,
				provisioned_usage_limit_usd: 0
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
