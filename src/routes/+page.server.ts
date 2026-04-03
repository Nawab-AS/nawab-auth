import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;

	// Redirect authenticated users to dashboard
	if (user) {
		throw redirect(303, '/dashboard');
	}

	// Only unauthenticated users reach here
	return {};
};
