import adapter from '@sveltejs/adapter-vercel';
import { loadEnv } from 'vite';
import { relative, sep } from 'node:path';

const env = loadEnv('', process.cwd(), '');
const trustedOrigin = new URL(env.OIDC_REDIRECT_URIS).origin;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, except for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		adapter: adapter(),
		csrf: {
			trustedOrigins: [trustedOrigin]
		}
	}
};

export default config;
