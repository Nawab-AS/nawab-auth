<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();

	const remainingCredits = $derived(data.totalCreditsUsd - data.pastUsageUsd - data.currentUsageUsd);
</script>

<svelte:head>
	<title>Dashboard - Nawab Auth</title>
</svelte:head>

<main class="page">
	<section class="hero">
		<div>
			<p class="eyebrow">User dashboard</p>
			<h1>Track access and credits from one place.</h1>
			<p class="lede">
				Supabase owns authentication, MFA, and linked identities. This dashboard will eventually
				tie your canonical user ID to the OpenRouter key lifecycle and usage ledger.
			</p>
		</div>

		<div class="status-card">
			<div>
				<span>Locale</span>
				<strong>{data.locale}</strong>
			</div>
			<div>
				<span>Admin</span>
				<strong>{data.isAdmin ? 'Yes' : 'No'}</strong>
			</div>
			<div>
				<span>Active key</span>
				<strong>{data.activeKeyId ?? 'Not linked'}</strong>
			</div>
			<form method="POST" action="/logout" class="logout-form">
				<button type="submit" class="logout-button">Log out</button>
			</form>
		</div>
	</section>

	<section class="metrics">
		<article>
			<span>Total allowance</span>
			<strong>${data.totalCreditsUsd.toFixed(2)}</strong>
		</article>
		<article>
			<span>Past usage</span>
			<strong>${data.pastUsageUsd.toFixed(2)}</strong>
		</article>
		<article>
			<span>Current key usage</span>
			<strong>${data.currentUsageUsd.toFixed(2)}</strong>
		</article>
		<article>
			<span>Remaining</span>
			<strong>${remainingCredits.toFixed(2)}</strong>
		</article>
	</section>

	<section class="panel-grid">
		<div class="panel">
			<h2>Roll key</h2>
			<p>
				Users and admins can both request a roll. The implementation currently returns a roll
				request marker and will later delete the old OpenRouter key immediately, then create a new
				one while preserving history in the ledger.
			</p>

			<form method="POST" action="?/rollKey">
				<input type="hidden" name="role" value={data.isAdmin ? 'admin' : 'user'} />
				<button type="submit" class="primary">Request roll</button>
			</form>

			{#if data.rolled}
				<p class="notice">Roll request {data.rollRequestId} queued in the scaffold.</p>
			{/if}

			{#if form}
				<p class="notice">{form.message}</p>
			{/if}
		</div>

		<div class="panel">
			<h2>Provider links</h2>
			<ul>
				{#each ['email OTP', 'Google', 'GitHub', 'Discord'] as provider (provider)}
					<li>{provider}</li>
				{/each}
			</ul>
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
		min-height: 100vh;
		padding: 2rem;
		max-width: 1180px;
		margin: 0 auto;
	}

	.hero {
		display: grid;
		grid-template-columns: 1.5fr 1fr;
		gap: 1.25rem;
		align-items: stretch;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.2em;
		color: #f5b76a;
		font-size: 0.78rem;
	}

	h1,
	h2 {
		margin: 0;
	}

	h1 {
		font-size: clamp(1.9rem, 5vw, 2.6rem);
		line-height: 1.1;
	}

	.lede,
	.panel p,
	.notice {
		color: #cbd5e1;
		line-height: 1.6;
	}

	.status-card,
	.panel,
	.metrics article {
		border-radius: 0.75rem;
		border: 1px solid #2b3038;
		background: #1a1d23;
	}

	.status-card {
		padding: 1.25rem;
		display: grid;
		gap: 1rem;
	}

	.logout-form {
		margin-top: 0.5rem;
	}

	.logout-button {
		width: 100%;
		background: #2a2f38;
		color: #e5e7eb;
		border: 1px solid #3b4250;
	}

	.logout-button:hover {
		background: #343a45;
	}

	.status-card span,
	.metrics span {
		display: block;
		font-size: 0.85rem;
		color: #9ca3af;
	}

	.status-card strong,
	.metrics strong {
		font-size: 1.15rem;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
		margin: 1.25rem 0;
	}

	.metrics article {
		padding: 1rem;
	}

	.panel-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.panel {
		padding: 1.25rem;
	}

	button {
		border: 0;
		border-radius: 0.5rem;
		padding: 0.9rem 1.2rem;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		background: #e5e7eb;
		color: #111827;
	}

	ul {
		padding-left: 1.2rem;
		margin: 0;
	}

	li + li {
		margin-top: 0.5rem;
	}

	.notice {
		margin-top: 1rem;
	}

	@media (max-width: 900px) {
		.hero,
		.panel-grid,
		.metrics {
			grid-template-columns: 1fr;
		}
	}
</style>
