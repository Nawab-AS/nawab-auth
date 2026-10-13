import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';

export interface SupabaseSessionUser {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string;
	isAdmin?: boolean;
}

const ACCESS_COOKIE = 'sb_access_token';
const REFRESH_COOKIE = 'sb_refresh_token';
// Refresh cookie cap: sessions can stay alive up to ~6 months through rotation.
// The access cookie stays short-lived; hooks.server.ts refreshes it on demand.
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export function getSupabaseUrl() {
	const url = env.SUPABASE_URL?.trim() || publicEnv.PUBLIC_SUPABASE_URL?.trim();
	if (!url) {
		throw new Error('Missing SUPABASE_URL or PUBLIC_SUPABASE_URL');
	}

	return url;
}

export function getSupabaseAnonKey() {
	const key = env.SUPABASE_ANON_KEY?.trim() || publicEnv.PUBLIC_SUPABASE_ANON_KEY?.trim();
	if (!key) {
		throw new Error('Missing SUPABASE_ANON_KEY or PUBLIC_SUPABASE_ANON_KEY');
	}

	return key;
}

function createSupabaseClient() {
	return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false
		}
	});
}

export function createSupabaseAnonClient() {
	return createSupabaseClient();
}

export function createSupabaseAuthedClient(accessToken: string) {
	return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false
		},
		global: {
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		}
	});
}

async function resolveSupabaseUserName(userId: string, accessToken: string, fallbackName: string) {
	const client = createSupabaseAuthedClient(accessToken);
	const { data } = await client
		.from('user_profiles')
		.select('preferred_name')
		.eq('user_id', userId)
		.maybeSingle();

	return data?.preferred_name?.trim() || fallbackName;
}

export function createSupabaseServiceRoleClient() {
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!serviceRoleKey) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for privileged operations.');
	}

	return createClient(getSupabaseUrl(), serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false
		}
	});
}

export function getAccessTokenFromCookies(cookies: Cookies) {
	return cookies.get(ACCESS_COOKIE)?.trim() ?? null;
}

export function getRefreshTokenFromCookies(cookies: Cookies) {
	return cookies.get(REFRESH_COOKIE)?.trim() ?? null;
}

export async function refreshSupabaseSession(
	refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; user: SupabaseSessionUser } | null> {
	if (!refreshToken) {
		return null;
	}

	const supabase = createSupabaseClient();
	const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
	if (error || !data.session?.access_token || !data.user) {
		return null;
	}

	const fallbackName =
		data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? data.user.email ?? data.user.id;
	const name = await resolveSupabaseUserName(data.user.id, data.session.access_token, fallbackName);

	return {
		accessToken: data.session.access_token,
		refreshToken: data.session.refresh_token,
		user: {
			id: data.user.id,
			email: data.user.email ?? '',
			emailVerified: Boolean(data.user.email_confirmed_at),
			name,
			isAdmin: data.user.user_metadata?.isAdmin === true || data.user.user_metadata?.role === 'admin'
		}
	};
}

export function setSupabaseRefreshCookie(cookies: Cookies, refreshToken: string) {
	cookies.set(REFRESH_COOKIE, refreshToken, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: REFRESH_COOKIE_MAX_AGE
	});
}

export function setSupabaseSessionCookies(
	cookies: Cookies,
	accessToken: string,
	refreshToken: string | null
) {
	setSupabaseAccessCookie(cookies, accessToken);
	if (refreshToken) {
		setSupabaseRefreshCookie(cookies, refreshToken);
	}
}

export async function getSupabaseUserFromAccessToken(accessToken: string): Promise<SupabaseSessionUser | null> {
	if (!accessToken) {
		return null;
	}

	const supabase = createSupabaseClient();
	const { data, error } = await supabase.auth.getUser(accessToken);
	if (error || !data.user) {
		return null;
	}

	const fallbackName =
		data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? data.user.email ?? data.user.id;
	const name = await resolveSupabaseUserName(data.user.id, accessToken, fallbackName);

	return {
		id: data.user.id,
		email: data.user.email ?? '',
		emailVerified: Boolean(data.user.email_confirmed_at),
		name,
		isAdmin: data.user.user_metadata?.isAdmin === true || data.user.user_metadata?.role === 'admin'
	};
}

export async function getSupabaseUserFromCookies(cookies: Cookies) {
	const accessToken = getAccessTokenFromCookies(cookies);
	if (!accessToken) {
		return null;
	}

	return getSupabaseUserFromAccessToken(accessToken);
}

export async function signInWithEmailPassword(email: string, password: string) {
	const supabase = createSupabaseClient();
	const { data, error } = await supabase.auth.signInWithPassword({ email, password });

	if (error || !data.session || !data.user) {
		return { error: error?.message ?? 'Failed to sign in with Supabase.', data: null } as const;
	}

	const fallbackName =
		data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? data.user.email ?? data.user.id;
	const name = await resolveSupabaseUserName(data.user.id, data.session.access_token, fallbackName);

	return {
		error: null,
		data: {
			accessToken: data.session.access_token,
			refreshToken: data.session.refresh_token,
			expiresAt: data.session.expires_at,
			user: {
				id: data.user.id,
				email: data.user.email ?? '',
				emailVerified: Boolean(data.user.email_confirmed_at),
				name,
				isAdmin: data.user.user_metadata?.isAdmin === true || data.user.user_metadata?.role === 'admin'
			}
		}
	} as const;
}

export function setSupabaseAccessCookie(cookies: Cookies, accessToken: string) {
	cookies.set(ACCESS_COOKIE, accessToken, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: 60 * 60
	});
}

export function clearSupabaseSessionCookies(cookies: Cookies) {
	cookies.delete(ACCESS_COOKIE, { path: '/' });
	cookies.delete(REFRESH_COOKIE, { path: '/' });
}
