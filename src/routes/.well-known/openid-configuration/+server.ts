import { json } from '@sveltejs/kit';
import { buildDiscoveryDocument } from '../../../lib/server/oidc.ts';

export const GET = () => {
	try {
		return json(buildDiscoveryDocument(), { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown discovery configuration error';
		return json(
			{ error: 'server_configuration_error', error_description: message },
			{ status: 500, headers: { 'cache-control': 'no-store' } }
		);
	}
};
