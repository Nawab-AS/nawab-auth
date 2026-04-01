import { json } from '@sveltejs/kit';
import { buildJwksDocument } from '../../../lib/server/oidc.ts';

export const GET = async () =>
	json(await buildJwksDocument(), { headers: { 'cache-control': 'no-store' } });
