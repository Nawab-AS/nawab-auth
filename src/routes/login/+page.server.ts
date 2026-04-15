import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import type { Actions, PageServerLoad } from './$types';
import {
	getAccessTokenFromCookies,
	getSupabaseAnonKey,
	getSupabaseUrl,
	setSupabaseAccessCookie
} from '$lib/server/supabase';
import {
	BANNED_ACCOUNT_MESSAGE,
	enableApiKeyForOidcLogin,
	generateApiKeyForOidcLogin,
	getOidcApiKeyGateState,
	isUserBanned,
	isUserOnboarded,
	markOnboardingVideoWatched
} from '$lib/server/account';
import { getOAuthSettings } from '$lib/server/oauth-settings';
import { getErrorMessage, normalizeReturnToPath } from '$lib/server/http';
import { getIssuer } from '$lib/server/oidc';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

const OTP_COOLDOWN_MS = 45_000;
const otpCooldownByEmail = new Map<string, number>();
const AUTH_RETURN_TO_COOKIE = 'auth_return_to';
const AUTH_RETURN_TO_MAX_AGE_SECONDS = 10 * 60;

function isGenericReturnTo(value: string) {
	return value === '/' || value === '/dashboard';
}

function getEffectiveReturnTo(primary: string | null | undefined, cookieValue: string | null | undefined) {
	const normalizedPrimary = normalizeReturnToPath(primary);
	const normalizedCookie = cookieValue ? normalizeReturnToPath(cookieValue) : null;

	if (normalizedCookie?.startsWith('/oauth/authorize') && isGenericReturnTo(normalizedPrimary)) {
		return normalizedCookie;
	}

	return normalizedPrimary;
}

function getCookieReturnTo(valueToStore: string, existingCookieValue: string | null | undefined) {
	const normalizedExisting = existingCookieValue ? normalizeReturnToPath(existingCookieValue) : null;

	if (normalizedExisting?.startsWith('/oauth/authorize') && isGenericReturnTo(valueToStore)) {
		return normalizedExisting;
	}

	return valueToStore;
}

function resolveReturnToFromForm(
	formData: FormData,
	url: URL,
	cookies: Cookies,
	fallback = '/dashboard'
) {
	return getEffectiveReturnTo(
		String(
			formData.get('redirect_to') ??
				formData.get('return_to') ??
				url.searchParams.get('redirect_to') ??
				url.searchParams.get('return_to') ??
				fallback
		),
		cookies.get(AUTH_RETURN_TO_COOKIE)
	);
}

function requireOidcGateActionContext(
	locals: App.Locals,
	cookies: Cookies,
	returnTo: string
) {
	const user = locals.user;
	if (!user) {
		throw redirect(303, '/login');
	}

	if (!returnTo.startsWith('/oauth/authorize')) {
		return {
			error: fail(400, {
				gateMessage: 'This action is only available for OIDC sign-in.',
				returnTo
			})
		};
	}

	const accessToken = getAccessTokenFromCookies(cookies);
	if (!accessToken) {
		throw redirect(303, '/login');
	}

	return {
		user,
		accessToken
	};
}

function getOnboardingVideoUrl(): string {
	const value = env.ONBOARDING_DEMO_VIDEO_URL?.trim();
	if (!value) {
		throw new Error('ONBOARDING_DEMO_VIDEO_URL is required.');
	}

	return value;
}

export const load: PageServerLoad = async ({ url, fetch, locals, cookies }) => {
	const currentCookieReturnTo = cookies.get(AUTH_RETURN_TO_COOKIE);
	const requestedReturnTo = url.searchParams.get('redirect_to') ?? url.searchParams.get('return_to');
	const returnTo = getEffectiveReturnTo(requestedReturnTo, currentCookieReturnTo);
	const user = locals.user;
	const cookieReturnTo = getCookieReturnTo(returnTo, currentCookieReturnTo);

	cookies.set(AUTH_RETURN_TO_COOKIE, cookieReturnTo, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		maxAge: AUTH_RETURN_TO_MAX_AGE_SECONDS
	});

	const isOidcAuthorizeReturn = returnTo.startsWith('/oauth/authorize');

	// Redirect authenticated users to the requested target, unless this is OIDC return that needs key gate checks.
	if (user && !isOidcAuthorizeReturn) {
		throw redirect(303, returnTo);
	}

	const authError = url.searchParams.get('error');

	const oauthSettings = await getOAuthSettings(fetch);

	const supabaseUrl = getSupabaseUrl();
	const authOrigin = new URL(getIssuer()).origin;

	const baseData = {
		returnTo,
		authError,
		oauthSettings,
		supabaseUrl,
		authOrigin,
		onboardingVideoUrl: getOnboardingVideoUrl()
	};

	if (!user) {
		return baseData;
	}

	const accessToken = getAccessTokenFromCookies(cookies);
	if (!accessToken) {
		throw redirect(303, '/login');
	}

	const oidcGate = await getOidcApiKeyGateState(user.id, accessToken);
	if (oidcGate.canProceedToOidc) {
		throw redirect(303, returnTo);
	}

	return {
		...baseData,
		signedIn: true,
		oidcGate
	};
};

export const actions: Actions = {
	sendOtp: async ({ request, fetch, cookies, url }) => {
		const formData = await request.formData();
		const email = String(formData.get('email') ?? '').trim();
		const returnTo = resolveReturnToFromForm(formData, url, cookies);

		const normalizedEmail = email.toLowerCase();

		if (normalizedEmail.endsWith('@hdsb.ca')) {
			return fail(400, {
				message: 'This email domain is not allowed',
				returnTo,
				email
			});
		}

		const now = Date.now();
		const nextAllowedAt = otpCooldownByEmail.get(normalizedEmail) ?? 0;
		if (nextAllowedAt > now) {
			const remainingSeconds = Math.ceil((nextAllowedAt - now) / 1000);
			return fail(429, {
				message: `Please wait ${remainingSeconds}s before requesting another code.`,
				returnTo,
				email,
				cooldownRemaining: remainingSeconds
			});
		}

		try {
			const response = await fetch('/api/send-otp', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: normalizedEmail })
			});

			const data = await response.json();

			if (!response.ok) {
				return fail(response.status, {
					message: data.error ?? 'Failed to send OTP.',
					returnTo,
					email
				});
			}

			otpCooldownByEmail.set(normalizedEmail, now + OTP_COOLDOWN_MS);

			return {
				success: true,
				message: `OTP sent to ${email}. Check your inbox for the 6-digit code.`,
				returnTo,
				otpSent: true,
				email,
				cooldownRemaining: Math.ceil(OTP_COOLDOWN_MS / 1000)
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to send OTP.';
			return fail(500, { message, returnTo, email });
		}
	},
	verifyOtp: async ({ request, cookies, url }) => {
		const formData = await request.formData();
		const email = String(formData.get('email') ?? '').trim();
		const token = String(formData.get('token') ?? '').trim();
		const returnTo = resolveReturnToFromForm(formData, url, cookies);

		if (!email) {
			return fail(400, { message: 'Email is required.', returnTo, email, token });
		}

		if (!token) {
			return fail(400, { message: 'OTP code is required.', returnTo, email, token });
		}

		try {
			const client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
				auth: {
					autoRefreshToken: false,
					persistSession: false,
					detectSessionInUrl: false
				}
			});

			const { data, error } = await client.auth.verifyOtp({
				email: email.toLowerCase(),
				token,
				type: 'email'
			});

			if (error || !data.session?.access_token) {
				return fail(400, {
					message: error?.message ?? 'Failed to verify OTP code.',
					returnTo,
					email,
					token
				});
			}

			if (!data.user) {
				return fail(400, {
					message: 'Failed to resolve user for OTP verification.',
					returnTo,
					email,
					token
				});
			}

			if (await isUserBanned(data.user.id, data.session.access_token)) {
				return fail(403, {
					message: BANNED_ACCOUNT_MESSAGE,
					returnTo,
					email,
					token
				});
			}

			setSupabaseAccessCookie(cookies, data.session.access_token);

			const accessToken = getAccessTokenFromCookies(cookies);
			const onboarded = await isUserOnboarded(data.user.id, accessToken);
			if (!onboarded) {
				throw redirect(303, '/onboarding');
			}

			cookies.delete(AUTH_RETURN_TO_COOKIE, { path: '/' });

			if (returnTo.startsWith('/oauth/authorize')) {
				throw redirect(303, `/login?redirect_to=${encodeURIComponent(returnTo)}`);
			}

			throw redirect(303, returnTo);
		} catch (err) {
			if (isRedirect(err)) {
				throw err;
			}

			const message = err instanceof Error ? err.message : 'Failed to verify OTP code.';
			return fail(500, { message, returnTo, email, token });
		}
	},
	markVideoWatched: async ({ locals, cookies, request, url }) => {
		const formData = await request.formData();
		const returnTo = resolveReturnToFromForm(formData, url, cookies);
		const context = requireOidcGateActionContext(locals, cookies, returnTo);
		if ('error' in context) {
			return context.error;
		}

		const { user, accessToken } = context;

		try {
			await markOnboardingVideoWatched(user.id, accessToken);
			const oidcGate = await getOidcApiKeyGateState(user.id, accessToken);
			return {
				returnTo,
				signedIn: true,
				oidcGate,
				gateMessage: 'Video requirement completed.'
			};
		} catch (error) {
			return fail(400, {
				returnTo,
				signedIn: true,
				gateMessage: getErrorMessage(error, 'Failed to mark video as watched.')
			});
		}
	},
	generateApiKey: async ({ locals, cookies, request, url }) => {
		const formData = await request.formData();
		const returnTo = resolveReturnToFromForm(formData, url, cookies);
		const context = requireOidcGateActionContext(locals, cookies, returnTo);
		if ('error' in context) {
			return context.error;
		}

		const { user, accessToken } = context;

		try {
			const generatedApiKey = await generateApiKeyForOidcLogin(user.id, accessToken);
			const oidcGate = await getOidcApiKeyGateState(user.id, accessToken);
			return {
				returnTo,
				signedIn: true,
				oidcGate,
				generatedApiKey,
				gateMessage: generatedApiKey
					? 'API key generated. Copy it now; it will not be shown again.'
					: 'API key already exists.'
			};
		} catch (error) {
			return fail(400, {
				returnTo,
				signedIn: true,
				gateMessage: getErrorMessage(error, 'Failed to generate API key.')
			});
		}
	},
	enableApiKey: async ({ locals, cookies, request, url }) => {
		const formData = await request.formData();
		const returnTo = resolveReturnToFromForm(formData, url, cookies);
		const context = requireOidcGateActionContext(locals, cookies, returnTo);
		if ('error' in context) {
			return context.error;
		}

		const { user, accessToken } = context;

		try {
			await enableApiKeyForOidcLogin(user.id, accessToken);
			const oidcGate = await getOidcApiKeyGateState(user.id, accessToken);
			return {
				returnTo,
				signedIn: true,
				oidcGate,
				gateMessage: 'API key enabled.'
			};
		} catch (error) {
			return fail(400, {
				returnTo,
				signedIn: true,
				gateMessage: getErrorMessage(error, 'Failed to enable API key.')
			});
		}
	}
};
