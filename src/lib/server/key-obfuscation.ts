import { env } from '$env/dynamic/private';

const OR_KEY_PREFIX = 'sk-or-v1-';
const NW_KEY_PREFIX = 'nwb-ch-v1-';
const secretRaw = env.CIPHER_SECRET?.trim() || env.SECRET?.trim() || '';
const secret = Number.parseInt(secretRaw, 10);
const chars = 'qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890';

if (!Number.isInteger(secret)) {
	throw new Error('Missing or invalid secret. Set CIPHER_SECRET (or SECRET) as an integer env var.');
}

const normalizedSecret = ((secret % chars.length) + chars.length) % chars.length;
const chars2 = chars.slice(normalizedSecret) + chars.slice(0, normalizedSecret);

const CIPHER: Record<string, string> = { '-': '-' };
for (let i = 0; i < chars.length; i += 1) {
	CIPHER[chars[i]] = chars2[i];
}

const UNCIPHER = Object.fromEntries(Object.entries(CIPHER).map(([k, v]) => [v, k]));

export function encodeProxyApiKey(orKey: string | null | undefined): string {
	if (!orKey || !orKey.startsWith(OR_KEY_PREFIX)) {
		return 'ERROR-INVALID-PREFIX';
	}

	const keyData = orKey.slice(OR_KEY_PREFIX.length).split('');
	const encodedBody = keyData.map((char) => CIPHER[char] || char).join('');
	return NW_KEY_PREFIX + encodedBody;
}
