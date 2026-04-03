import { env } from '$env/dynamic/private';
import { fail, redirect } from '@sveltejs/kit';
import { completeUserOnboarding, isUserOnboarded } from '$lib/server/account';
import { getAccessTokenFromCookies } from '$lib/server/supabase';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const user = locals.user;
	if (!user) {
		throw redirect(303, '/login');
	}

	const accessToken = getAccessTokenFromCookies(cookies);
	const onboarded = await isUserOnboarded(user.id, accessToken);
	if (onboarded) {
		throw redirect(303, '/dashboard');
	}

	const supportEmail = env.SUPPORT_EMAIL?.trim() || 'support@example.com';

	return {
		email: user.email,
		supportEmail
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const user = locals.user;
		if (!user) {
			throw redirect(303, '/login');
		}

		const formData = await request.formData();
		const preferredName = String(formData.get('preferred_name') ?? '').trim();
		const acceptTos = formData.get('accept_tos') === 'on';
		const supportEmail = env.SUPPORT_EMAIL?.trim() || 'support@example.com';

		if (!preferredName) {
			return fail(400, {
				message: 'Preferred name is required.',
				preferredName,
				email: user.email,
				supportEmail
			});
		}

		if (preferredName.length > 80) {
			return fail(400, {
				message: 'Preferred name must be 80 characters or fewer.',
				preferredName,
				email: user.email,
				supportEmail
			});
		}

		if (!acceptTos) {
			return fail(400, {
				message: 'You must accept the Terms of Service to continue.',
				preferredName,
				email: user.email,
				supportEmail
			});
		}

		const accessToken = getAccessTokenFromCookies(cookies);
		if (!accessToken) {
			throw redirect(303, '/login');
		}

		try {
			await completeUserOnboarding({
				user,
				accessToken,
				preferredName
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to complete onboarding.';
			return fail(500, {
				message,
				preferredName,
				email: user.email,
				supportEmail
			});
		}

		throw redirect(303, '/dashboard');
	}
};
