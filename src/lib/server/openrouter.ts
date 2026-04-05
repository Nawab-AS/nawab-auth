export interface OpenRouterUsage {
	totalUsageUsd: number;
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
