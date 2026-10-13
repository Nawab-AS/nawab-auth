import { env } from '$env/dynamic/private';
import type { DashboardSnapshot } from '$lib/server/oidc';
import type { SupabaseSessionUser } from '$lib/server/supabase';
import { createSupabaseAuthedClient, createSupabaseServiceRoleClient } from '$lib/server/supabase';

export const BANNED_ACCOUNT_MESSAGE = `Your account is banned. Please contact support to appeal this ban: ${env.SUPPORT_EMAIL?.trim() || 'support@example.com'}`;

export const USER_STATES = ['unverified', 'verified', 'admin', 'banned'] as const;
export type UserState = (typeof USER_STATES)[number];

const INITIAL_ALLOWED_USAGE_USD = 0.0001;

interface UserProfileRow {
	user_id?: string;
	preferred_name: string | null;
	user_state: UserState;
	first_sso_completed: boolean;
	onboarding_video_watched: boolean;
}

export interface AdminUserRow {
	userId: string;
	preferredName: string | null;
	userState: UserState;
	isAdmin: boolean;
	isVerified: boolean;
	banned: boolean;
}

export type AdminUserDetail = AdminUserRow;

interface UserSsoState {
	userState: UserState;
	isVerified: boolean;
	firstSsoCompleted: boolean;
	videoWatched: boolean;
}

export interface OidcGateState {
	isVerified: boolean;
	onboarded: boolean;
	firstSsoCompleted: boolean;
	videoWatched: boolean;
	canProceedToOidc: boolean;
	canManageAfterPrerequisites: boolean;
}

interface CompleteOnboardingInput {
	user: SupabaseSessionUser;
	accessToken: string;
	preferredName: string;
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

export async function getOidcGateState(
	userId: string,
	accessToken: string
): Promise<OidcGateState> {
	const client = createSupabaseAuthedClient(accessToken);
	const [profileResult, accountResult] = await Promise.all([
		client
			.from('user_profiles')
			.select('user_id,user_state,first_sso_completed,onboarding_video_watched')
			.eq('user_id', userId)
			.maybeSingle(),
		client
			.from('user_accounts')
			.select('user_id')
			.eq('user_id', userId)
			.maybeSingle()
	]);

	if (profileResult.error) {
		throw new Error(profileResult.error.message);
	}

	if (accountResult.error) {
		throw new Error(accountResult.error.message);
	}

	const profile = profileResult.data as
		| {
				user_id?: string;
				user_state?: UserState;
				first_sso_completed?: boolean;
				onboarding_video_watched?: boolean;
		  }
		| null;
	const account = accountResult.data as { user_id?: string } | null;

	const userState = toUserState(profile?.user_state);
	const isVerified = isUserStateVerified(userState);
	const firstSsoCompleted = Boolean(profile?.first_sso_completed);
	const videoWatched = Boolean(profile?.onboarding_video_watched) || firstSsoCompleted;
	const onboarded = Boolean(profile?.user_id && account?.user_id);

	return {
		isVerified,
		onboarded,
		firstSsoCompleted,
		videoWatched,
		canProceedToOidc: isVerified && onboarded,
		canManageAfterPrerequisites: onboarded && isVerified
	};
}

async function ensureUserProfileRecord(userId: string, accessToken: string) {
	const client = createSupabaseAuthedClient(accessToken);
	const privilegedClient = createSupabaseServiceRoleClient();
	const { data, error: selectError } = await client
		.from('user_profiles')
		.select('user_id')
		.eq('user_id', userId)
		.maybeSingle();

	if (selectError) {
		throw new Error(selectError.message);
	}

	if (data?.user_id) {
		return;
	}

	const { error: insertError } = await privilegedClient.from('user_profiles').insert({
		user_id: userId,
		preferred_name: null,
		user_state: 'unverified',
		first_sso_completed: false,
		onboarding_video_watched: false
	});

	if (insertError) {
		throw new Error(insertError.message);
	}
}

async function ensureUserAccountRecord(userId: string, accessToken: string) {
	const client = createSupabaseAuthedClient(accessToken);
	const privilegedClient = createSupabaseServiceRoleClient();
	const { data, error: selectError } = await client
		.from('user_accounts')
		.select('user_id')
		.eq('user_id', userId)
		.maybeSingle();

	if (selectError) {
		throw new Error(selectError.message);
	}

	if (data?.user_id) {
		return;
	}

	const { error: insertError } = await privilegedClient.from('user_accounts').insert({
		user_id: userId,
		api_key_hash: null,
		api_key_fingerprint: null,
		allowed_usage_usd: INITIAL_ALLOWED_USAGE_USD,
		usage_carried_forward_usd: 0,
		provisioned_usage_limit_usd: 0,
		api_key_disabled: false
	});

	if (insertError) {
		throw new Error(insertError.message);
	}
}

export async function ensurePendingUserRegistrationRecords(userId: string, accessToken: string) {
	await ensureUserProfileRecord(userId, accessToken);
	await ensureUserAccountRecord(userId, accessToken);
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
		api_key_fingerprint: null,
		allowed_usage_usd: INITIAL_ALLOWED_USAGE_USD,
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
	accessToken: string
): Promise<string> {
	const client = createSupabaseAuthedClient(accessToken);
	const { data, error } = await client
		.from('user_profiles')
		.select('preferred_name')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to fetch preferred_name for user ${userId}: ${error.message}`);
	}

	const preferredName = String((data as { preferred_name?: string | null } | null)?.preferred_name ?? '').trim();
	if (!preferredName) {
		throw new Error(`Missing preferred_name for user ${userId}.`);
	}

	return preferredName;
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
			preferredName: user.name
		};
	}

	const client = createSupabaseAuthedClient(accessToken);
	const { data, error } = await client
		.from('user_profiles')
		.select('preferred_name,user_state')
		.eq('user_id', user.id)
		.maybeSingle();

	if (error) {
		throw new Error(error.message);
	}

	const profile = (data ?? null) as UserProfileRow | null;
	const userState = toUserState(profile?.user_state);

	return {
		userId: user.id,
		email: user.email,
		emailVerified: user.emailVerified,
		locale: 'en',
		isAdmin: isUserStateAdmin(userState) || Boolean(user.isAdmin),
		isVerified: isUserStateVerified(userState),
		userState,
		preferredName: profile?.preferred_name ?? user.name
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
		.select('user_id,preferred_name,user_state')
		.limit(limit);

	if (search) {
		profileQuery = profileQuery.or(`user_id.ilike.%${search}%,preferred_name.ilike.%${search}%`);
	}

	const { data: profilesData, error: profileError } = await profileQuery;
	if (profileError) {
		throw new Error(profileError.message);
	}

	return ((profilesData ?? []) as UserProfileRow[]).map((profile) => {
		const userId = profile.user_id ?? '';
		const userState = toUserState(profile.user_state);

		return {
			userId,
			preferredName: profile.preferred_name,
			userState,
			isAdmin: isUserStateAdmin(userState),
			isVerified: isUserStateVerified(userState),
			banned: isUserStateBanned(userState)
		};
	});
}

export async function getAdminUserDetail(
	userId: string,
	accessToken: string
): Promise<AdminUserDetail | null> {
	const client = createSupabaseAuthedClient(accessToken);
	const { data, error } = await client
		.from('user_profiles')
		.select('user_id,preferred_name,user_state')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(error.message);
	}

	if (!data) {
		return null;
	}

	const profile = data as UserProfileRow;
	const userState = toUserState(profile.user_state);

	return {
		userId,
		preferredName: profile.preferred_name,
		userState,
		isAdmin: isUserStateAdmin(userState),
		isVerified: isUserStateVerified(userState),
		banned: isUserStateBanned(userState)
	};
}

export async function markFirstSsoCompleted(userId: string, accessToken: string) {
	await ensureUserProfileRecord(userId, accessToken);
	const client = createSupabaseAuthedClient(accessToken);
	const { error } = await client
		.from('user_profiles')
		.update({ first_sso_completed: true })
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

async function deleteSupabaseAuthUser(userId: string) {
	const privilegedClient = createSupabaseServiceRoleClient();
	const { error } = await privilegedClient.auth.admin.deleteUser(userId);

	if (error && error.status !== 404) {
		throw new Error(`Failed to delete auth user: ${error.message}`);
	}
}

export async function deleteUserAccountPermanently(userId: string) {
	const errors: string[] = [];

	try {
		await deleteSupabaseAuthUser(userId);
	} catch (error) {
		errors.push(error instanceof Error ? error.message : 'Failed to delete auth user.');
	}

	if (errors.length > 0) {
		throw new Error(errors.join(' '));
	}
}
