<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();

	const remainingCredits = $derived(
		data.allowedUsageUsd - data.usageCarriedForwardUsd - data.currentUsageUsd
	);
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
				<span>Preferred name</span>
				<strong>{data.preferredName ?? data.user!.name}</strong>
			</div>
			<div>
				<span>Linked email</span>
				<strong>{data.user!.email}</strong>
			</div>
			<div class="status-actions">
				<form method="POST" action="/logout" class="logout-form">
					<button type="submit" class="logout-button">Log out</button>
				</form>

				{#if data.isAdmin}
					<form method="GET" action="/admin" class="admin-form">
						<button type="submit" class="admin-button">Admin dashboard</button>
					</form>
				{/if}
			</div>
		</div>
	</section>

	<section class="metrics">
		<article>
			<span>Allowed usage</span>
			<strong>${data.allowedUsageUsd.toFixed(2)}</strong>
		</article>
		<article>
			<span>Usage carried forward</span>
			<strong>${data.usageCarriedForwardUsd.toFixed(2)}</strong>
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

			{#if form?.rollMessage}
				<p class="notice">{form.rollMessage}</p>
			{/if}
		</div>

		<div class="panel">
			<h2>Provider links</h2>
			{#if data.providers.length === 0}
				<p class="notice">No OAuth providers are currently enabled in Supabase settings.</p>
			{:else}
				<ul class="provider-list" aria-label="Provider links">
					{#each data.providers as provider (provider.provider)}
						<li class="provider-row">
							<span class="provider-name">{provider.displayName}</span>
							{#if provider.isLinked}
								<form method="POST" action="?/revokeProvider">
									<input type="hidden" name="provider" value={provider.provider} />
									<button type="submit" class="provider-button revoke">Revoke</button>
								</form>
							{:else}
								<form method="POST" action="?/linkProvider">
									<input type="hidden" name="provider" value={provider.provider} />
									<button type="submit" class="provider-button link">Link</button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if form?.providerMessage}
				<p class="notice">{form.providerMessage}</p>
			{/if}
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

	.status-actions {
		display: grid;
		gap: 0.75rem;
	}

	.logout-form {
		margin: 0;
	}

	.admin-form {
		margin: 0;
	}

	.logout-button,
	.admin-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 2.75rem;
		border-radius: 0.5rem;
		padding: 0.9rem 1.2rem;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		text-decoration: none;
	}

	.logout-button {
		background: #2a2f38;
		color: #e5e7eb;
		border: 1px solid #3b4250;
	}

	.logout-button:hover {
		background: #343a45;
	}

	.admin-button {
		background: transparent;
		color: #f5b76a;
		border: 1px solid #f5b76a;
	}

	.admin-button:hover {
		background: rgba(245, 183, 106, 0.12);
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

	.provider-list {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid #2b3038;
		border-radius: 0.6rem;
	}

	.provider-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 0.85rem;
		border-bottom: 1px solid #2b3038;
	}

	.provider-row:last-child {
		border-bottom: 0;
	}

	.provider-name {
		font-weight: 600;
	}

	.provider-button {
		padding: 0.55rem 0.8rem;
		font-size: 0.9rem;
		min-width: 5.25rem;
	}

	.provider-button.link {
		background: #e5e7eb;
		color: #111827;
	}

	.provider-button.revoke {
		background: #2a2f38;
		color: #e5e7eb;
		border: 1px solid #3b4250;
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
