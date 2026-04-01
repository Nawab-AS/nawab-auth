import { fail, redirect } from '@sveltejs/kit';
import { buildDashboardSnapshot, createRollRequestId } from '$lib/server/oidc';

export const load = ({ url }) => {
	return {
		...buildDashboardSnapshot(),
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
