import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSupabaseAccessCookie } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ cookies }) => {
	// Clear the authentication cookie
	clearSupabaseAccessCookie(cookies);

	// Redirect to login page
	throw redirect(303, '/login');
};

export const GET: RequestHandler = async ({ cookies }) => {
	// Also support GET for simple logout links
	clearSupabaseAccessCookie(cookies);
	throw redirect(303, '/login');
};
