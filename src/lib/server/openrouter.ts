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

function getManagementApiKey(): string {
	return env.OPENROUTER_MANAGEMENT_API_KEY?.trim() ?? '';
}

function getOpenRouterHeaders(apiKey: string): HeadersInit {
	return {
		Authorization: `Bearer ${apiKey}`,
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
	limitReset?: 'daily' | 'weekly' | 'monthly' | null;
}): Promise<OpenRouterProvisionedKey | null> {
	const managementApiKey = getManagementApiKey();
	if (!managementApiKey) {
		console.warn('OpenRouter management API key is not configured.');
		return null;
	}

	const response = await fetch('https://openrouter.ai/api/v1/keys', {
		method: 'POST',
		headers: getOpenRouterHeaders(managementApiKey),
		body: JSON.stringify({
			name: input.name,
			limit: input.limit,
			include_byok_in_limit: input.includeByokInLimit ?? false,
			limit_reset: input.limitReset ?? null
		})
	});

	if (!response.ok) {
		throw new Error(`OpenRouter key creation failed: ${response.status} ${response.statusText}`);
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

	const response = await fetch(`https://openrouter.ai/api/v1/keys/${encodeURIComponent(keyHash)}`, {
		method: 'DELETE',
		headers: getOpenRouterHeaders(managementApiKey)
	});

	if (!response.ok) {
		throw new Error(`OpenRouter key deletion failed: ${response.status} ${response.statusText}`);
	}

	return true;
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
				usage?: number;
				limit?: number;
			};
		};

		// OpenRouter returns usage in cents, convert to USD
		const usageInCents = data.data?.usage ?? 0;
		const totalUsageUsd = usageInCents / 100;

		return {
			totalUsageUsd
		};
	} catch (err) {
		console.error('Failed to fetch OpenRouter usage:', err);
		return null;
	}
}
