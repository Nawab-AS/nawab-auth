import { json } from '@sveltejs/kit';
import { buildDiscoveryDocument } from '../../../lib/server/oidc.ts';

export const GET = () => json(buildDiscoveryDocument(), { headers: { 'cache-control': 'no-store' } });
