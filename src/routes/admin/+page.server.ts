import { fail, redirect } from '@sveltejs/kit';
import { buildDashboardSnapshot, createRollRequestId } from '$lib/server/oidc';
import { getAccessTokenFromCookies } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	// User is guaranteed to be present due to route protection in hooks.server.ts
	const user = locals.user;
	const accessToken = getAccessTokenFromCookies(cookies);

	// Check if user has admin role
	if (!user?.isAdmin) {
		throw redirect(303, '/dashboard');
	}

	const snapshot = await buildDashboardSnapshot(user, accessToken);

	return {
		user,
		...snapshot,
		rolled: url.searchParams.get('rolled') === '1',
		rollRequestId: url.searchParams.get('rollRequestId') ?? null
	};
};

export const actions = {
	rollKey: async ({ request }) => {
		const formData = await request.formData();
		const role = String(formData.get('role') ?? 'admin');

		if (role !== 'admin') {
			return fail(400, { message: 'Admin roll requires admin role.' });
		}

		const rollRequestId = createRollRequestId();
		throw redirect(303, `/admin?rolled=1&rollRequestId=${encodeURIComponent(rollRequestId)}`);
	}
};
