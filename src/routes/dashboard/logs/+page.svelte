<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatUsd(value: number): string {
		return `$${value.toFixed(6)}`;
	}

	function formatEndTime(microsSince2000: number): string {
		if (!Number.isFinite(microsSince2000) || microsSince2000 < 0) {
			return '-';
		}

		const epoch2000Ms = 946684800000;
		const unixMs = epoch2000Ms + Math.floor(microsSince2000 / 1000);
		const date = new Date(unixMs);

		if (Number.isNaN(date.getTime())) {
			return '-';
		}

		return new Intl.DateTimeFormat('en-US', {
			timeZone: 'America/New_York',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: 'numeric',
			minute: '2-digit',
			second: '2-digit',
			hour12: true
		}).format(date);
	}
</script>

<svelte:head>
	<title>Logs - Nawab Auth</title>
</svelte:head>

<main class="page">
	<header class="header">
		<h1>Webhook Logs</h1>
		<form method="GET" action="/dashboard" class="back-form">
			<button type="submit" class="secondary">Back to dashboard</button>
		</form>
	</header>

	<section class="panel">
		{#if data.error}
			<p class="error">{data.error}</p>
		{/if}

		<p class="meta">Showing page {data.page} (max {data.pageSize} rows), total logs: {data.totalCount}</p>

		{#if data.logs.length === 0}
			<p>No logs found.</p>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Prompt ID</th>
							<th>Model</th>
							<th>Time</th>
							<th>Input Cost</th>
							<th>Output Cost</th>
							<th>Total Cost</th>
							<th>Input Tokens</th>
							<th>Thinking Tokens</th>
							<th>Response Tokens</th>
							<th>Finish Reason</th>
						</tr>
					</thead>
					<tbody>
						{#each data.logs as log (log.id)}
							<tr>
								<td>{log.id}</td>
								<td>{log.model}</td>
								<td>{formatEndTime(log.endTime)}</td>
								<td>{formatUsd(log.inputCost)}</td>
								<td>{formatUsd(log.outputCost)}</td>
								<td>{formatUsd(log.totalCost)}</td>
								<td>{log.inputTokens}</td>
								<td>{log.thinkingTokens}</td>
								<td>{log.responseTokens}</td>
								<td>{log.finishReason ?? '-'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<div class="pager">
			<form method="GET" action="/dashboard/logs">
				<input type="hidden" name="page" value={String(Math.max(1, data.page - 1))} />
				<input type="hidden" name="limit" value={String(data.pageSize)} />
				<button type="submit" class="secondary" disabled={!data.hasPrevious}>Previous</button>
			</form>

			<form method="GET" action="/dashboard/logs">
				<input type="hidden" name="page" value={String(data.page + 1)} />
				<input type="hidden" name="limit" value={String(data.pageSize)} />
				<button type="submit" class="primary" disabled={!data.hasNext}>Next</button>
			</form>
		</div>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #0f1115;
		color: #e5e7eb;
		font-family: 'Segoe UI', sans-serif;
	}

	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.panel {
		background: #1a1d23;
		border: 1px solid #2b3038;
		border-radius: 0.75rem;
		padding: 1rem;
	}

	.table-wrap {
		overflow-x: auto;
		margin-top: 1rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		min-width: 980px;
	}

	th,
	td {
		text-align: left;
		padding: 0.6rem;
		border-bottom: 1px solid #2b3038;
		font-size: 0.9rem;
	}

	.meta {
		color: #9ca3af;
	}

	.error {
		color: #fca5a5;
	}

	.pager {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 1rem;
	}

	button {
		border: 0;
		border-radius: 0.5rem;
		padding: 0.65rem 1rem;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.primary {
		background: #e5e7eb;
		color: #111827;
	}

	.secondary {
		background: transparent;
		color: #f5b76a;
		border: 1px solid #f5b76a;
	}

	@media (max-width: 700px) {
		.header {
			flex-direction: column;
			align-items: flex-start;
		}

		.pager {
			flex-direction: column;
		}
	}
</style>
