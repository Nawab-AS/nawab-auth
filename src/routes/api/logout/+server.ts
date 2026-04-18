import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSupabaseAccessCookie } from '$lib/server/supabase';

const handleLogout: RequestHandler = async ({ cookies }) => {
	clearSupabaseAccessCookie(cookies);
	cookies.delete('auth_return_to', { path: '/' });
	throw redirect(303, '/login');
};

export const POST: RequestHandler = handleLogout;
export const GET: RequestHandler = handleLogout;
