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

export function getAccessTokenFromCookies(cookies: Cookies) {
	return cookies.get(ACCESS_COOKIE)?.trim() ?? null;
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

export function clearSupabaseAccessCookie(cookies: Cookies) {
	cookies.delete(ACCESS_COOKIE, { path: '/' });
}
