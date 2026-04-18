import { redirect, type RequestHandler } from '@sveltejs/kit';
import { clearSupabaseAccessCookie } from '$lib/server/supabase';

const signOutAndRedirect: RequestHandler = async ({ cookies }) => {
	clearSupabaseAccessCookie(cookies);
	cookies.delete('auth_return_to', { path: '/' });
	throw redirect(303, '/login');
};

export const GET = signOutAndRedirect;
export const POST = signOutAndRedirect;