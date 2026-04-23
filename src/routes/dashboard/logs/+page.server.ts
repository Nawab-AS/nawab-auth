import { redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { buildDashboardSnapshot } from '$lib/server/oidc';
import {
	createSupabaseAuthedClient,
	getSupabaseUrl,
	getAccessTokenFromCookies
} from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

interface TransactionRow {
	id: number;
	api_key_name: string;
	model: string;
	end_time: string | number;
	input_cost: string | number;
	output_cost: string | number;
	total_cost: string | number;
	input_tokens: number;
	thinking_tokens: number;
	response_tokens: number;
	finish_reason: string | null;
	created_at: string;
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

function toNumber(value: string | number): number {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : 0;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function parsePageParam(value: string | null): number {
	const page = Number(value ?? '1');
	if (!Number.isInteger(page) || page < 1) {
		return 1;
	}

	return page;
}

function parseLimitParam(value: string | null): number {
	const limit = Number(value ?? String(PAGE_SIZE));
	if (!Number.isInteger(limit) || limit < 1) {
		return PAGE_SIZE;
	}

	return Math.min(limit, PAGE_SIZE);
}

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const user = locals.user;
	if (!user) {
		throw redirect(303, '/login?redirect_to=%2Fdashboard%2Flogs');
	}

	const accessToken = getAccessTokenFromCookies(cookies);
	if (!accessToken) {
		throw redirect(303, '/login?redirect_to=%2Fdashboard%2Flogs');
	}

	const snapshot = await buildDashboardSnapshot(user, accessToken);
	const isAdmin = snapshot.isAdmin;

	const page = parsePageParam(url.searchParams.get('page'));
	const pageSize = parseLimitParam(url.searchParams.get('limit'));

	const client = createServiceRoleClient();
	if (!client) {
		return {
			logs: [],
			page,
			hasPrevious: page > 1,
			hasNext: false,
			totalCount: 0,
			pageSize,
			error: 'SUPABASE_SERVICE_ROLE_KEY is required to read logs.'
		};
	}

	const from = (page - 1) * pageSize;
	const to = from + pageSize - 1;
	let userApiKeyHash: string | null = null;

	if (!isAdmin) {
		const authedClient = createSupabaseAuthedClient(accessToken);
		const { data, error } = await authedClient
			.from('user_accounts')
			.select('api_key_hash')
			.eq('user_id', user.id)
			.maybeSingle();

		if (error) {
			return {
				logs: [],
				page,
				hasPrevious: page > 1,
				hasNext: false,
				totalCount: 0,
				pageSize,
				error: `Failed to load account API key: ${error.message}`,
				isAdmin
			};
		}

		userApiKeyHash = String((data as { api_key_hash?: string | null } | null)?.api_key_hash ?? '').trim() || null;

		if (!userApiKeyHash) {
			return {
				logs: [],
				page,
				hasPrevious: page > 1,
				hasNext: false,
				totalCount: 0,
				pageSize,
				error: null,
				isAdmin
			};
		}
	}

	let transactionQuery = client
		.from('transactions')
		.select(
			'id, api_key_name, model, end_time, input_cost, output_cost, total_cost, input_tokens, thinking_tokens, response_tokens, finish_reason, created_at',
			{ count: 'exact' }
		)
		.order('end_time', { ascending: false })
		.range(from, to);

	if (!isAdmin && userApiKeyHash) {
		transactionQuery = transactionQuery.eq('api_key_name', userApiKeyHash);
	}

	const { data, error, count } = await transactionQuery;

	if (error) {
		return {
			logs: [],
			page,
			hasPrevious: page > 1,
			hasNext: false,
			totalCount: count ?? 0,
			pageSize,
			error: `Failed to load logs: ${error.message}`
		};
	}

	const logs = ((data ?? []) as TransactionRow[]).map((row) => ({
		id: row.id,
		model: row.model,
		endTime: toNumber(row.end_time),
		inputCost: toNumber(row.input_cost),
		outputCost: toNumber(row.output_cost),
		totalCost: toNumber(row.total_cost),
		inputTokens: row.input_tokens,
		thinkingTokens: row.thinking_tokens,
		responseTokens: row.response_tokens,
		finishReason: row.finish_reason,
		createdAt: row.created_at
	}));

	const totalCount = count ?? 0;
	const hasNext = page * pageSize < totalCount;

	return {
		logs,
		page,
		hasPrevious: page > 1,
		hasNext,
		totalCount,
		pageSize,
		isAdmin
	};
};
