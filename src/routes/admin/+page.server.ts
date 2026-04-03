import { redirect } from '@sveltejs/kit';
import { getDashboardSnapshot } from '$lib/server/account';
import { getAccessTokenFromCookies } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const user = locals.user;

	if (!user) {
		throw redirect(303, '/dashboard');
	}

	const accessToken = getAccessTokenFromCookies(cookies);
	const snapshot = await getDashboardSnapshot(user, accessToken);

	if (!snapshot.isAdmin) {
		throw redirect(303, '/dashboard');
	}

	return {};
};
