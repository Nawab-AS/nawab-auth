import { createSupabaseAuthedClient } from '$lib/server/supabase';
import type { SupabaseSessionUser } from '$lib/server/supabase';
import type { DashboardSnapshot } from '$lib/server/oidc';
import { getOpenRouterUsage } from '$lib/server/openrouter';

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
	api_key_disabled: boolean;
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

export async function completeUserOnboarding(input: CompleteOnboardingInput) {
	const client = createSupabaseAuthedClient(input.accessToken);
	const preferredName = input.preferredName.trim();

	const profilePayload = {
		user_id: input.user.id,
		preferred_name: preferredName,
		is_admin: Boolean(input.user.isAdmin),
		banned: false
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

	let currentUsageUsd = 0;
	
	// Fetch OpenRouter usage if user has an active API key
	if (account?.api_key_hash && !account.api_key_disabled) {
		const apiUsage = await getOpenRouterUsage(account.api_key_hash);
		if (apiUsage) {
			currentUsageUsd = apiUsage.totalUsageUsd;
		}
	}
	
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
		apiKeyDisabled: account?.api_key_disabled ?? false,
		rolledKeyIds: []
	};
}
