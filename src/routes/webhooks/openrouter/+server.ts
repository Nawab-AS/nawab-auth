import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { getSupabaseUrl } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

interface OpenTelemetryAttribute {
	key?: string;
	value?: {
		stringValue?: string;
		doubleValue?: number;
		intValue?: number;
	};
}

interface OpenTelemetrySpan {
	endTimeUnixNano?: string;
	attributes?: OpenTelemetryAttribute[];
}

interface OpenRouterWebhookPayload {
	resourceSpans?: Array<{
		scopeSpans?: Array<{
			spans?: OpenTelemetrySpan[];
		}>;
	}>;
}

interface OpenRouterWebhookLog {
	apiKeyName: string | null;
	model: string;
	endTime: number;
	inputCost: number;
	outputCost: number;
	totalCost: number;
	inputTokens: number;
	thinkingTokens: number;
	responseTokens: number;
	finishReason: string | null;
}

function getServiceRoleKey() {
	return env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
}

function createServiceRoleClient() {
	const serviceRoleKey = getServiceRoleKey();
	if (!serviceRoleKey) {
		return null;
	}

	return createClient(getSupabaseUrl(), serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false
		}
	});
}

function getAllowedWebhookOrigins(): string[] {
	const configured = (env.OPENROUTER_WEBHOOK_ALLOWED_ORIGINS ?? 'https://openrouter.ai')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);

	const origins = configured
		.map((value) => {
			try {
				return new URL(value).origin;
			} catch {
				return null;
			}
		})
		.filter((origin): origin is string => Boolean(origin));

	return [...new Set(origins)];
}

function getWebhookCorsHeaders(requestOrigin: string | null): Record<string, string> {
	if (!requestOrigin) {
		return { Vary: 'Origin' };
	}

	if (!getAllowedWebhookOrigins().includes(requestOrigin)) {
		return { Vary: 'Origin' };
	}

	return {
		Vary: 'Origin',
		'Access-Control-Allow-Origin': requestOrigin,
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, X-Webhook-Signature',
		'Access-Control-Max-Age': '3600'
	};
}

function isAllowedWebhookOrigin(requestOrigin: string | null): boolean {
	if (!requestOrigin) {
		// Server-to-server requests typically have no Origin header.
		return true;
	}

	return getAllowedWebhookOrigins().includes(requestOrigin);
}

function readStringAttribute(attributes: OpenTelemetryAttribute[], key: string): string | null {
	const value = attributes.find((attribute) => attribute.key === key)?.value?.stringValue;
	return typeof value === 'string' ? value : null;
}

function readNumberAttribute(attributes: OpenTelemetryAttribute[], key: string): number {
	const attribute = attributes.find((entry) => entry.key === key)?.value;
	const value = attribute?.doubleValue ?? attribute?.intValue;
	return Number.isFinite(value) ? Number(value) : 0;
}

/**
 * Convert Unix nanosecond timestamp to microseconds since 2000-01-01 00:00:00 UTC.
 * Returns 0 if the value cannot be parsed.
 */
function parseUnixNanoToEpoch2000Micros(value: string | undefined): number {
	if (!value || !/^\d+$/.test(value)) {
		return 0;
	}

	try {
		const millis = Number(BigInt(value) / 1_000_000n);
		if (!Number.isFinite(millis)) {
			return 0;
		}

		// Epoch 2000-01-01 00:00:00 UTC is 946684800000 milliseconds from Unix epoch
		const epoch2000Ms = 946684800000;
		const microsSince2000 = (millis - epoch2000Ms) * 1000;
		return Number.isFinite(microsSince2000) ? Math.max(0, microsSince2000) : 0;
	} catch {
		return 0;
	}
}

function extractWebhookLogs(payload: unknown): OpenRouterWebhookLog[] {
	if (!payload || typeof payload !== 'object') {
		return [];
	}

	const parsed = payload as OpenRouterWebhookPayload;
	const spans = (parsed.resourceSpans ?? []).flatMap(
		(resourceSpan) => (resourceSpan.scopeSpans ?? []).flatMap((scopeSpan) => scopeSpan.spans ?? [])
	);

	return spans.map((span) => {
		const attributes = span.attributes ?? [];
		const outputTokens = readNumberAttribute(attributes, 'gen_ai.usage.output_tokens');
		const thinkingTokens = readNumberAttribute(attributes, 'gen_ai.usage.output_tokens.reasoning');
		const apiKeyName = readStringAttribute(attributes, 'trace.metadata.openrouter.api_key_name');
		const model =
			readStringAttribute(attributes, 'gen_ai.request.model') ??
			readStringAttribute(attributes, 'gen_ai.response.model') ??
			'unknown';

		return {
			apiKeyName,
			model,
			endTime: parseUnixNanoToEpoch2000Micros(span.endTimeUnixNano),
			inputCost: readNumberAttribute(attributes, 'gen_ai.usage.input_cost'),
			outputCost: readNumberAttribute(attributes, 'gen_ai.usage.output_cost'),
			totalCost: readNumberAttribute(attributes, 'gen_ai.usage.total_cost'),
			inputTokens: readNumberAttribute(attributes, 'gen_ai.usage.input_tokens'),
			thinkingTokens,
			responseTokens: Math.max(0, outputTokens - thinkingTokens),
			finishReason: readStringAttribute(attributes, 'gen_ai.response.finish_reason')
		};
	});
}

export const OPTIONS: RequestHandler = async ({ request }) => {
	const requestOrigin = request.headers.get('origin');
	if (!isAllowedWebhookOrigin(requestOrigin)) {
		return json({ error: 'Origin not allowed.' }, { status: 403, headers: getWebhookCorsHeaders(requestOrigin) });
	}

	return new Response(null, {
		status: 204,
		headers: getWebhookCorsHeaders(requestOrigin)
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const requestOrigin = request.headers.get('origin');
	const responseHeaders = getWebhookCorsHeaders(requestOrigin);

	if (!isAllowedWebhookOrigin(requestOrigin)) {
		return json({ error: 'Origin not allowed.' }, { status: 403, headers: responseHeaders });
	}

	const expectedSignature = env.OPENROUTER_WEBHOOK_SIGNATURE?.trim() ?? '';
	if (!expectedSignature) {
		return json(
			{ error: 'Webhook signature is not configured.' },
			{ status: 500, headers: responseHeaders }
		);
	}

	const receivedSignature = request.headers.get('x-webhook-signature')?.trim() ?? '';
	if (receivedSignature !== expectedSignature) {
		return json(
			{ error: 'Invalid webhook signature.' },
			{ status: 401, headers: responseHeaders }
		);
	}

	const rawBody = await request.text();
	let payload: unknown = null;

	if (rawBody) {
		try {
			payload = JSON.parse(rawBody) as unknown;
		} catch {
			return json(
				{ error: 'Webhook payload must be valid JSON.' },
				{ status: 400, headers: responseHeaders }
			);
		}
	}

	const logs = extractWebhookLogs(payload);
	const transactions = logs.filter((entry) => (entry.apiKeyName !== null) && (entry.inputTokens > 0 && entry.responseTokens > 0));

	if (transactions.length > 0) {
		const client = createServiceRoleClient();
		if (!client) {
			return json(
				{ error: 'SUPABASE_SERVICE_ROLE_KEY is required to store webhook transactions.' },
				{ status: 500, headers: responseHeaders }
			);
		}

		const { error } = await client.from('transactions').insert(
			transactions.map((entry) => ({
				api_key_name: entry.apiKeyName,
				model: entry.model,
				end_time: entry.endTime,
				input_cost: entry.inputCost,
				output_cost: entry.outputCost,
				total_cost: entry.totalCost,
				input_tokens: entry.inputTokens,
				thinking_tokens: entry.thinkingTokens,
				response_tokens: entry.responseTokens,
				finish_reason: entry.finishReason
			}))
		);

		if (error) {
			return json(
				{ error: `Failed to persist webhook transactions: ${error.message}` },
				{ status: 500, headers: responseHeaders }
			);
		}
	}


	return json({ ok: true }, { headers: responseHeaders });
};
