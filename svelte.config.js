import adapter from '@sveltejs/adapter-vercel';
import { loadEnv } from 'vite';
import { relative, sep } from 'node:path';

const env = loadEnv('', process.cwd(), '');

function toOrigin(value) {
	try {
		return new URL(value.trim()).origin;
	} catch {
		return null;
	}
}

const trustedOrigins = [
	...(env.OIDC_REDIRECT_URIS ?? '').split(','),
	...(env.ALLOWED_ORIGINS ?? '').split(',')
]
	.map(toOrigin)
	.filter((origin) => Boolean(origin));

const dedupedTrustedOrigins = [...new Set(trustedOrigins)];

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
			trustedOrigins: dedupedTrustedOrigins,
			checkOrigin: false
		}
	}
};

export default config;
