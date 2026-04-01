import { json } from '@sveltejs/kit';

export const POST = async () => {
	return json(
		{
			error: 'not_implemented',
			error_description: 'Token exchange will be wired to Supabase sessions and signed JWT issuance in the next slice.'
		},
		{ status: 501, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } }
	);
};
