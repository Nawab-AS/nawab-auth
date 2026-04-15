import { env } from '$env/dynamic/private';

export interface OpenRouterUsage {
	totalUsageUsd: number;
}

export interface OpenRouterApiKeyRecord {
	hash?: string;
	key?: string;
	label?: string | null;
	name?: string;
	disabled?: boolean;
	limit?: number;
	limit_remaining?: number;
	limit_reset?: string | null;
	include_byok_in_limit?: boolean;
}

export interface OpenRouterProvisionedKey {
	keyValue: string;
	hash: string;
	label: string | null;
}

interface OpenRouterApiKeyListResponse {
	data?: OpenRouterApiKeyRecord[];
}

function getManagementApiKey(): string {
	return env.OPENROUTER_MANAGEMENT_API_KEY?.trim() ?? '';
}

function getOpenRouterHeaders(apiKey: string): HeadersInit {
	return {
		Authorization: `Bearer ${apiKey}`,
		Accept: 'application/json',
		'Content-Type': 'application/json'
	};
}

async function readOpenRouterApiKeyRecord(response: Response): Promise<OpenRouterApiKeyRecord> {
	const data = (await response.json()) as {
		data?: OpenRouterApiKeyRecord | OpenRouterApiKeyRecord[];
		key?: string;
		hash?: string;
		label?: string;
		name?: string;
	};

	const record = (Array.isArray(data.data) ? data.data[0] : data.data ?? {}) as Partial<OpenRouterApiKeyRecord>;
	const keyValue = data.key ?? record.key ?? '';
	const hash = data.hash ?? record.hash ?? '';
	const label = data.label ?? record.label ?? null;

	return {
		...record,
		key: keyValue || undefined,
		hash,
		label
	};
}

export async function createOpenRouterApiKey(input: {
	name: string;
	limit: number;
	includeByokInLimit?: boolean;
	limitReset?: 'daily' | 'weekly' | 'monthly' | 'never' | null;
}): Promise<OpenRouterProvisionedKey | null> {
	const managementApiKey = getManagementApiKey();
	if (!managementApiKey) {
		console.warn('OpenRouter management API key is not configured.');
		return null;
	}

	const payload: {
		name: string;
		limit?: number;
		include_byok_in_limit: boolean;
		limit_reset?: 'daily' | 'weekly' | 'monthly';
	} = {
		name: input.name,
		// Enforced global behavior: always count BYOK usage in limits.
		include_byok_in_limit: true
	};

	if (Number.isFinite(input.limit) && input.limit > 0) {
		payload.limit = input.limit;
	}

	const response = await fetch('https://openrouter.ai/api/v1/keys', {
		method: 'POST',
		headers: getOpenRouterHeaders(managementApiKey),
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		let details: string | undefined;
		try {
			const body = await response.text();
			if (body) {
				details = ` - ${body}`;
			}
		} catch {
			// Ignore response body parse errors for failed requests.
		}

		throw new Error(
			`OpenRouter key creation failed: ${response.status} ${response.statusText}${details ?? ''}`
		);
	}

	const record = await readOpenRouterApiKeyRecord(response);
	const keyValue = record.key ?? '';

	if (!keyValue || !record.hash) {
		throw new Error('OpenRouter key creation returned an incomplete response.');
	}

	return {
		keyValue,
		hash: record.hash,
		label: record.label ?? null
	};
}

export async function deleteOpenRouterApiKey(keyHash: string): Promise<boolean> {
	const managementApiKey = getManagementApiKey();
	if (!managementApiKey || !keyHash.trim()) {
		return false;
	}

	const readResponse = await fetch(`https://openrouter.ai/api/v1/keys/${encodeURIComponent(keyHash)}`, {
		method: 'GET',
		headers: getOpenRouterHeaders(managementApiKey)
	});

	if (readResponse.status === 404) {
		return false;
	}

	if (!readResponse.ok) {
		throw new Error(`OpenRouter key read failed: ${readResponse.status} ${readResponse.statusText}`);
	}

	const readPayload = (await readResponse.json()) as {
		data?: {
			disabled?: boolean;
		};
	};

	if (readPayload.data?.disabled === true) {
		const enabled = await setOpenRouterApiKeyDisabled(keyHash, false);
		if (!enabled) {
			throw new Error('OpenRouter key must be enabled before deletion, but enabling failed.');
		}
	}

	const response = await fetch(`https://openrouter.ai/api/v1/keys/${encodeURIComponent(keyHash)}`, {
		method: 'DELETE',
		headers: getOpenRouterHeaders(managementApiKey)
	});

	if (!response.ok) {
		if (response.status === 404) {
			return false;
		}

		throw new Error(`OpenRouter key deletion failed: ${response.status} ${response.statusText}`);
	}

	return true;
}

export async function deleteOpenRouterApiKeysByName(name: string): Promise<number> {
	const managementApiKey = getManagementApiKey();
	const normalized = name.trim();
	if (!managementApiKey || !normalized) {
		return 0;
	}

	const listResponse = await fetch('https://openrouter.ai/api/v1/keys', {
		method: 'GET',
		headers: getOpenRouterHeaders(managementApiKey)
	});

	if (!listResponse.ok) {
		throw new Error(`OpenRouter key list failed: ${listResponse.status} ${listResponse.statusText}`);
	}

	const payload = (await listResponse.json()) as OpenRouterApiKeyListResponse;
	const matches = (payload.data ?? []).filter((record) => record.name?.trim() === normalized);

	let deleted = 0;
	for (const record of matches) {
		if (!record.hash) {
			continue;
		}

		const didDelete = await deleteOpenRouterApiKey(record.hash);
		if (didDelete) {
			deleted += 1;
		}
	}

	return deleted;
}

export async function setOpenRouterApiKeyDisabled(
	keyHash: string,
	disabled: boolean
): Promise<boolean> {
	const managementApiKey = getManagementApiKey();
	if (!managementApiKey || !keyHash.trim()) {
		return false;
	}

	const endpoint = `https://openrouter.ai/api/v1/keys/${encodeURIComponent(keyHash)}`;
	const body = JSON.stringify({ disabled });

	const response = await fetch(endpoint, {
		method: 'PATCH',
		headers: getOpenRouterHeaders(managementApiKey),
		body
	});

	if (response.status === 404) {
		return false;
	}

	let details: string | undefined;
	try {
		details = await response.text();
	} catch {
		// Some failed responses may not provide a readable body.
	}

	if (!response.ok) {
		throw new Error(
			`OpenRouter key update failed: ${response.status} ${response.statusText}${
				details ? ` - ${details}` : ''
			}`
		);
	}

	try {
		if (details) {
			const payload = JSON.parse(details) as {
				data?: {
					disabled?: boolean;
				};
			};

			if (typeof payload.data?.disabled === 'boolean' && payload.data.disabled !== disabled) {
				throw new Error('OpenRouter key update did not apply the requested disabled state.');
			}
		}
	} catch (parseError) {
		if (parseError instanceof Error && parseError.message.includes('did not apply')) {
			throw parseError;
		}
		// Non-JSON responses are accepted as long as the API returned success.
	}

	return true;
}

export async function setOpenRouterApiKeysDisabledByName(
	name: string,
	disabled: boolean
): Promise<number> {
	const managementApiKey = getManagementApiKey();
	const normalized = name.trim();
	if (!managementApiKey || !normalized) {
		return 0;
	}

	const listResponse = await fetch('https://openrouter.ai/api/v1/keys', {
		method: 'GET',
		headers: getOpenRouterHeaders(managementApiKey)
	});

	if (!listResponse.ok) {
		throw new Error(`OpenRouter key list failed: ${listResponse.status} ${listResponse.statusText}`);
	}

	const payload = (await listResponse.json()) as OpenRouterApiKeyListResponse;
	const matches = (payload.data ?? []).filter((record) => record.name?.trim() === normalized);

	let updated = 0;
	for (const record of matches) {
		if (!record.hash) {
			continue;
		}

		const didUpdate = await setOpenRouterApiKeyDisabled(record.hash, disabled);
		if (didUpdate) {
			updated += 1;
		}
	}

	return updated;
}

export async function setOpenRouterApiKeyLimit(
	keyHash: string,
	limit: number
): Promise<boolean> {
	const managementApiKey = getManagementApiKey();
	if (!managementApiKey || !keyHash.trim()) {
		return false;
	}

	const endpoint = `https://openrouter.ai/api/v1/keys/${encodeURIComponent(keyHash)}`;
	const body = JSON.stringify({
		limit,
		include_byok_in_limit: true
	});

	const response = await fetch(endpoint, {
		method: 'PATCH',
		headers: getOpenRouterHeaders(managementApiKey),
		body
	});

	if (response.status === 404) {
		return false;
	}

	let details: string | undefined;
	try {
		details = await response.text();
	} catch {
		// Some failed responses may not provide a readable body.
	}

	if (!response.ok) {
		throw new Error(
			`OpenRouter key limit update failed: ${response.status} ${response.statusText}${
				details ? ` - ${details}` : ''
			}`
		);
	}

	return true;
}

export async function setOpenRouterApiKeysLimitByName(
	name: string,
	limit: number
): Promise<number> {
	const managementApiKey = getManagementApiKey();
	const normalized = name.trim();
	if (!managementApiKey || !normalized) {
		return 0;
	}

	const listResponse = await fetch('https://openrouter.ai/api/v1/keys', {
		method: 'GET',
		headers: getOpenRouterHeaders(managementApiKey)
	});

	if (!listResponse.ok) {
		throw new Error(`OpenRouter key list failed: ${listResponse.status} ${listResponse.statusText}`);
	}

	const payload = (await listResponse.json()) as OpenRouterApiKeyListResponse;
	const matches = (payload.data ?? []).filter((record) => record.name?.trim() === normalized);

	let updated = 0;
	for (const record of matches) {
		if (!record.hash) {
			continue;
		}

		const didUpdate = await setOpenRouterApiKeyLimit(record.hash, limit);
		if (didUpdate) {
			updated += 1;
		}
	}

	return updated;
}

/**
 * Fetch all-time usage from OpenRouter API for a given API key.
 * Returns usage including BYOK (Bring Your Own Key) if applicable.
 * Edge-compatible - uses fetch API only.
 */
export async function getOpenRouterUsage(apiKey: string): Promise<OpenRouterUsage | null> {
	if (!apiKey) {
		return null;
	}

	try {
		const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${apiKey}`
			}
		});

		if (!response.ok) {
			console.error(`OpenRouter API error: ${response.status} ${response.statusText}`);
			return null;
		}

		const data = (await response.json()) as {
			data?: {
				usage?: number | string;
				limit?: number;
			};
		};

		const usageValue = Number(data.data?.usage ?? 0);
		const totalUsageUsd = Number.isFinite(usageValue) ? usageValue : 0;

		return {
			totalUsageUsd
		};
	} catch (err) {
		console.error('Failed to fetch OpenRouter usage:', err);
		return null;
	}
}
