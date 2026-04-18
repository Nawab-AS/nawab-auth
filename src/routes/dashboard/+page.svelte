<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();
	let dismissRolledKeyDialog = $state(false);
	let copyStatus = $state<'idle' | 'copied' | 'error'>('idle');
	const rolledKey = $derived(form?.rolledKey ?? '');
	const showRolledKeyDialog = $derived(rolledKey.length > 0 && !dismissRolledKeyDialog);

	const remainingCredits = $derived(
		data.allowedUsageUsd - data.usageCarriedForwardUsd - data.currentUsageUsd
	);

	const apiKeyState = $derived.by(() => {
		if (!data.apiKeyAssigned) {
			return 'Not assigned';
		}

		if (data.apiKeyDisabled) {
			return 'Disabled';
		}

		return 'Assigned';
	});

	const userStateLabel = $derived.by(() => {
		if (data.userState === 'unverified') {
			return 'Unverified';
		}

		if (data.userState === 'verified') {
			return 'Verified';
		}

		if (data.userState === 'admin') {
			return 'Admin';
		}

		return 'Banned';
	});

	async function copyRolledKey() {
		if (!rolledKey) {
			return;
		}

		try {
			await navigator.clipboard.writeText(rolledKey);
			copyStatus = 'copied';
		} catch {
			copyStatus = 'error';
		}
	}
</script>

<svelte:head>
	<title>Dashboard - Nawab Auth</title>
</svelte:head>

<main class="page">
	<section class="hero">
		<div>
			<h2 class="eyebrow">Nawab Auth <br/> Dashboard</h2>
		</div>

		<div class="status-card">
			<div>
				<span>Preferred name</span>
				<strong>{data.preferredName ?? data.user!.name}</strong>
			</div>
			<div>
				<span>Account state</span>
				<strong>{userStateLabel}</strong>
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
		{#if data.isVerified}
			<article>
				<span>Allowed usage</span>
				<strong>${data.allowedUsageUsd.toFixed(4)}</strong>
			</article>
			<article>
				<span>Remaining</span>
				<strong>${remainingCredits.toFixed(4)}</strong>
			</article>
			<article>
				<span>API key</span>
				<strong>{apiKeyState}</strong>
			</article>
			<article>
				<span>API key fingerprint</span>
				<strong>{data.apiKeyFingerprint ?? 'Not provisioned'}</strong>
			</article>
		{:else}
			<br/>
		{/if}
	</section>
		
	<section class="panel-grid">
		<div class="panel">
			<h2>API key Management</h2>
			
			{#if !data.isVerified}
				<p class="notice">Your account is unverified. Creating an API key is blocked until an admin verifies your account.</p>
			{:else}
				<p>Create a new key anytime, or disable your current key without deleting it.</p>
				<form method="POST" action="?/rollKey">
					<button type="submit" class="primary" disabled={!data.isVerified}>Roll API key</button>
				</form>

				<form method="POST" action="?/disableKey">
					<input type="hidden" name="disabled" value={data.apiKeyDisabled ? 'false' : 'true'} />
					<button type="submit" class="secondary">
						{data.apiKeyDisabled ? 'Enable API key' : 'Disable API key'}
					</button>
				</form>
			{/if}

			{#if data.rolled}
				<p class="notice">API key rolled.</p>
			{/if}

			{#if form?.rollMessage}
				<p class="notice">{form.rollMessage}</p>
			{/if}

			{#if form?.keyMessage}
				<p class="notice">{form.keyMessage}</p>
			{/if}

			<form method="GET" action="/help">
				<button type="submit" class="secondary">Help</button>
			</form>
		</div>

		<div class="panel">
			<h2>Linked providers</h2>
			<br/>
			{#if data.providers.length === 0}
				<p class="notice">No providers are available right now.</p>
			{:else}
				<ul class="provider-grid" aria-label="Linked providers">
					{#each data.providers as provider (provider.provider)}
						<li class="provider-item">
							<div class="provider-meta">
								<span class="provider-name">{provider.displayName}</span>
							</div>
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

	{#if showRolledKeyDialog}
		<div class="api-key-overlay" role="presentation">
			<dialog class="api-key-dialog" open aria-labelledby="rolled-key-title">
				<h2 id="rolled-key-title">New API key generated</h2>
				<p class="warning">Do not share your API key with anyone.</p>
				<p class="api-key-value">{rolledKey}</p>
				<div class="api-key-actions">
					<button type="button" class="primary" onclick={copyRolledKey}>Copy API key</button>
					<button
						type="button"
						class="secondary"
						onclick={() => {
							dismissRolledKeyDialog = true;
						}}
					>
						Close
					</button>
				</div>
				{#if copyStatus === 'error'}
					<p class="notice">Could not copy automatically. Select and copy manually.</p>
				{/if}
			</dialog>
		</div>
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		background: #0f1115;
		color: #e5e7eb;
		font-family: 'Segoe UI', sans-serif;
	}

	.page {
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
		letter-spacing: 0.1em;
		color: #f5b76a;
		font-size: 2rem;
	}

	h2 {
		margin: 0;
	}


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
		grid-template-columns: repeat(2, minmax(0, 1fr));
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

	.secondary {
		margin-top: 0.7rem;
		background: transparent;
		color: #f5b76a;
		border: 1px solid #f5b76a;
	}

	.provider-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid #2b3038;
	}

	.provider-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.85rem 0;
		border-bottom: 1px solid #2b3038;
	}

	.provider-meta {
		display: grid;
		gap: 0.2rem;
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

	@media (max-width: 520px) {
		.provider-item {
			align-items: flex-start;
			flex-direction: column;
		}

		.provider-item form,
		.provider-button {
			width: 100%;
		}
	}

	.notice {
		margin-top: 1rem;
	}

	.api-key-overlay {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		z-index: 100;
		overflow: auto;
		background: rgba(15, 17, 21, 0.55);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}

	.api-key-dialog {
		position: static;
		inset: auto;
		width: min(34rem, calc(100vw - 2rem));
		max-width: 34rem;
		border-radius: 0.75rem;
		border: 1px solid #2b3038;
		background: #1a1d23;
		color: #e5e7eb;
		padding: 1.25rem;
		margin: 0;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
	}

	.api-key-dialog h2 {
		margin-bottom: 0.75rem;
	}

	.warning {
		margin: 0 0 0.75rem;
		font-weight: 700;
		color: #f5b76a;
	}

	.api-key-value {
		margin: 0;
		padding: 0.85rem;
		border-radius: 0.5rem;
		border: 1px solid #2b3038;
		background: #0f1115;
		word-break: break-all;
		font-family: 'Courier New', monospace;
	}

	.api-key-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.api-key-actions .secondary {
		margin-top: 0;
	}

	@media (max-width: 900px) {
		.hero,
		.panel-grid,
		.metrics {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 520px) {
		.api-key-actions {
			grid-template-columns: 1fr;
		}
	}
</style>
