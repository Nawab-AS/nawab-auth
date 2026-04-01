import { json } from '@sveltejs/kit';

export const GET = async () => {
	return json(
		{
			error: 'not_implemented',
			error_description: 'Userinfo will be backed by the canonical Supabase user ID and linked providers.'
		},
		{ status: 501, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } }
	);
};
