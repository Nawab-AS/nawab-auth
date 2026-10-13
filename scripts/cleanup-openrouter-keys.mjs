// One-off cleanup: delete all per-user provisioned OpenRouter keys.
// Provisioned keys are named `Nawab Auth <supabaseUserId>`.
// The shared server-side key (used by LibreChat directly) has a different
// name and is left untouched.
//
// Usage:
//   OPENROUTER_MANAGEMENT_API_KEY=sk-or-... node scripts/cleanup-openrouter-keys.mjs        # dry run (lists matches)
//   OPENROUTER_MANAGEMENT_API_KEY=sk-or-... node scripts/cleanup-openrouter-keys.mjs --delete # actually deletes
//
// Run this only AFTER LibreChat is serving traffic on the shared key and
// balances are seeded — deleted per-user keys stop working immediately.

const API_BASE = 'https://openrouter.ai/api/v1';
const KEY_PREFIX = 'Nawab Auth ';

const managementKey = (process.env.OPENROUTER_MANAGEMENT_API_KEY ?? '').trim();
if (!managementKey) {
	console.error('Missing OPENROUTER_MANAGEMENT_API_KEY env var.');
	process.exit(1);
}

const shouldDelete = process.argv.includes('--delete');

async function api(path, options = {}) {
	const response = await fetch(`${API_BASE}${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${managementKey}`,
			'Content-Type': 'application/json',
			...(options.headers ?? {})
		}
	});

	const body = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(`OpenRouter ${options.method ?? 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
	}

	return body;
}

const listBody = await api('/keys');
const keys = Array.isArray(listBody) ? listBody : (listBody?.data ?? []);
if (!Array.isArray(keys)) {
	throw new Error(`Unexpected list-keys response shape: ${JSON.stringify(listBody)?.slice(0, 200)}`);
}

const provisioned = keys.filter((key) => String(key?.name ?? '').startsWith(KEY_PREFIX));

console.log(`Found ${keys.length} total key(s), ${provisioned.length} matching "${KEY_PREFIX}*" (dry run: ${shouldDelete ? 'OFF' : 'ON'}).`);
for (const key of provisioned) {
	console.log(`- ${key.name} (label=${key.label ?? 'n/a'}, hash=${String(key.hash ?? '').slice(0, 12)}..., usage=$${key.usage ?? '?'}, limit=${key.limit ?? 'none'})`);
}

if (!shouldDelete) {
	console.log('Pass --delete to actually delete these keys.');
	process.exit(0);
}

let deleted = 0;
for (const key of provisioned) {
	if (!key.hash) {
		console.warn(`Skipping ${key.name}: no hash to delete by.`);
		continue;
	}

	await api(`/keys/${encodeURIComponent(key.hash)}`, { method: 'DELETE' });
	deleted += 1;
	console.log(`Deleted ${key.name}.`);
}

console.log(`Done. Deleted ${deleted}/${provisioned.length} provisioned key(s).`);
