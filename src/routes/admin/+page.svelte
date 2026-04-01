<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();
</script>

<svelte:head>
	<title>Admin - Nawab Auth</title>
</svelte:head>

<main class="page">
	<section class="panel">
		<p class="eyebrow">Admin dashboard</p>
		<h1>Rotate keys, enforce budgets, and review audit history.</h1>
		<p class="lede">
			This will be the control surface for user and admin key rolls, immediate key deletion, and
			credit governance.
		</p>

		<div class="grid">
			<div>
				<span>Admin access</span>
				<strong>{data.isAdmin ? 'Enabled' : 'Locked'}</strong>
			</div>
			<div>
				<span>Canonical user ID</span>
				<strong>{data.userId}</strong>
			</div>
			<div>
				<span>Historical key rolls</span>
				<strong>{data.rolledKeyIds.length}</strong>
			</div>
			<div>
				<span>Remaining credits</span>
				<strong>${(data.totalCreditsUsd - data.pastUsageUsd - data.currentUsageUsd).toFixed(2)}</strong>
			</div>
		</div>

		<form method="POST" action="?/rollKey" class="roll-form">
			<input type="hidden" name="role" value="admin" />
			<button type="submit" class="primary">Roll key now</button>
		</form>

		{#if data.rolled}
			<p class="notice">Admin roll request {data.rollRequestId} queued in the scaffold.</p>
		{/if}

		{#if form}
			<p class="notice">{form.message}</p>
		{/if}
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
		max-width: 1040px;
		margin: 0 auto;
		display: grid;
		place-items: center;
	}

	.panel {
		width: 100%;
		padding: 2rem;
		border-radius: 0.75rem;
		border: 1px solid #2b3038;
		background: #1a1d23;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.2em;
		font-size: 0.76rem;
		color: #9ca3af;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.9rem, 5vw, 2.6rem);
		line-height: 1;
	}

	.lede,
	.notice {
		color: #cbd5e1;
		line-height: 1.6;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin: 1.5rem 0;
	}

	.grid div {
		padding: 1rem;
		border-radius: 0.6rem;
		background: #15181e;
		border: 1px solid #2b3038;
	}

	.grid span {
		display: block;
		font-size: 0.85rem;
		color: #9ca3af;
	}

	.grid strong {
		display: block;
		margin-top: 0.35rem;
		font-size: 1.05rem;
	}

	.primary {
		border: 0;
		border-radius: 0.5rem;
		padding: 0.9rem 1.2rem;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		background: #e5e7eb;
		color: #111827;
	}

	@media (max-width: 720px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
