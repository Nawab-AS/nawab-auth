import { json } from '@sveltejs/kit';

export const POST = async () => {
	return json({ error: 'not_implemented' }, { status: 501, headers: { 'cache-control': 'no-store' } });
};
