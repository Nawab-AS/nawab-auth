import { createSupabaseAuthedClient } from '$lib/server/supabase';
import type { SupabaseSessionUser } from '$lib/server/supabase';
import type { DashboardSnapshot } from '$lib/server/oidc';

interface UserProfileRow {
	preferred_name: string | null;
	is_admin: boolean;
	banned: boolean;
}

interface UserAccountRow {
	api_key_id: string | null;
	allowed_usage_usd: string | number | null;
	usage_carried_forward_usd: string | number | null;
	api_key_disabled: boolean;
}

function toNumber(value: string | number | null | undefined): number {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : 0;
	}

	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
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
			activeKeyId: null,
			apiKeyDisabled: false,
			rolledKeyIds: []
		};
	}

	const client = createSupabaseAuthedClient(accessToken);
	const [profileResult, accountResult] = await Promise.all([
		client.from('user_profiles').select('preferred_name,is_admin,banned').eq('user_id', user.id).maybeSingle(),
		client
			.from('user_accounts')
			.select('api_key_id,allowed_usage_usd,usage_carried_forward_usd,api_key_disabled')
			.eq('user_id', user.id)
			.maybeSingle()
	]);

	const profile = (profileResult.data ?? null) as UserProfileRow | null;
	const account = (accountResult.data ?? null) as UserAccountRow | null;

	return {
		userId: user.id,
		email: user.email,
		emailVerified: user.emailVerified,
		locale: 'en',
		isAdmin: profile?.is_admin ?? Boolean(user.isAdmin),
		preferredName: profile?.preferred_name ?? user.name,
		allowedUsageUsd: toNumber(account?.allowed_usage_usd),
		usageCarriedForwardUsd: toNumber(account?.usage_carried_forward_usd),
		currentUsageUsd: 0,
		activeKeyId: account?.api_key_id ?? null,
		apiKeyDisabled: account?.api_key_disabled ?? false,
		rolledKeyIds: []
	};
}
