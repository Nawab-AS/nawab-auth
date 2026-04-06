<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();
</script>

<svelte:head>
	<title>Consent - Nawab Auth</title>
</svelte:head>

<main class="shell">
	<section class="panel">
		<p class="eyebrow">Login with OIDC</p>
		<h1>Approve account sharing</h1>
		<p class="lede">This consent screen appears every time an app requests Login with OIDC.</p>

		<div class="share-card" aria-live="polite">
			<p class="share-title">Shared with this app</p>
			<ul class="claim-list">
				{#each data.consent.sharedClaims as claim (claim)}
					<li>{claim}</li>
				{/each}
			</ul>
			<p class="share-note">Only your name and email are shared. Password and OTP secrets are never shared.</p>
		</div>

		<div class="meta-grid">
			<div>
				<span>Client</span>
				<strong>{data.clientId}</strong>
			</div>
			<div>
				<span>Redirect URI</span>
				<strong>{data.redirectUri}</strong>
			</div>
			<div>
				<span>Scopes</span>
				<strong>{data.scopes.join(' ')}</strong>
			</div>
			<div>
				<span>Security</span>
				<strong>{data.codeChallenge ? 'Required' : 'Missing'}</strong>
			</div>
		</div>

		<p class="scope-label">Requested scopes</p>
		<ul class="scope-list" aria-label="Requested scopes">
			{#each data.scopes as scope (scope)}
				<li>{scope}</li>
			{/each}
		</ul>

		<div class="actions">
			<form method="POST" action="?/approve">
				<input type="hidden" name="client_id" value={data.clientId} />
				<input type="hidden" name="scope" value={data.scopes.join(' ')} />
				<input type="hidden" name="nonce" value={data.nonce} />
				<input type="hidden" name="code_challenge" value={data.codeChallenge} />
				<input type="hidden" name="redirect_uri" value={data.redirectUri} />
				<input type="hidden" name="state" value={data.state} />
				<button type="submit" class="primary">Approve</button>
			</form>

			<form method="POST" action="?/deny">
				<input type="hidden" name="client_id" value={data.clientId} />
				<input type="hidden" name="redirect_uri" value={data.redirectUri} />
				<input type="hidden" name="state" value={data.state} />
				<button type="submit" class="secondary">Deny</button>
			</form>
		</div>

		{#if form}
			<p class="notice">{form}</p>
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

	.shell {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 2rem;
	}

	.panel {
		width: min(760px, 100%);
		padding: 2rem;
		border: 1px solid #2b3038;
		border-radius: 0.75rem;
		background: #1a1d23;
	}

	.eyebrow {
		margin: 0 0 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.2em;
		font-size: 0.76rem;
		color: #9ca3af;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.9rem, 5vw, 2.6rem);
		line-height: 1.1;
	}

	.lede {
		max-width: 56ch;
		color: #cbd5e1;
		line-height: 1.6;
	}

	.share-card {
		margin-top: 1rem;
		margin-bottom: 1rem;
		padding: 1rem;
		border-radius: 0.6rem;
		border: 1px solid #334155;
		background: #101822;
	}

	.share-title {
		margin: 0 0 0.65rem;
		font-size: 0.95rem;
		font-weight: 700;
		color: #bfdbfe;
	}

	.claim-list {
		display: flex;
		gap: 0.65rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.claim-list li {
		padding: 0.45rem 0.8rem;
		border-radius: 999px;
		background: #0b2239;
		border: 1px solid #1d4f7a;
		font-weight: 600;
	}

	.share-note {
		margin: 0.8rem 0 0;
		color: #dbeafe;
		font-size: 0.92rem;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin: 1.5rem 0;
	}

	.scope-label {
		margin: 0 0 0.6rem;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: #9ca3af;
	}

	.meta-grid div {
		padding: 1rem;
		border-radius: 0.6rem;
		background: #15181e;
		border: 1px solid #2b3038;
	}

	.meta-grid span,
	.notice {
		display: block;
		color: #9ca3af;
		font-size: 0.9rem;
	}

	.meta-grid strong {
		display: block;
		margin-top: 0.35rem;
		font-size: 1rem;
		word-break: break-word;
	}

	.scope-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		padding: 0;
		margin: 0 0 1.5rem;
		list-style: none;
	}

	.scope-list li {
		padding: 0.5rem 0.8rem;
		border-radius: 999px;
		background: #2a2f38;
		border: 1px solid #3b4250;
		color: #e5e7eb;
	}

	.actions {
		display: flex;
		gap: 0.85rem;
		flex-wrap: wrap;
	}

	button {
		border: 0;
		border-radius: 0.5rem;
		padding: 0.9rem 1.25rem;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.primary {
		background: #e5e7eb;
		color: #111827;
	}

	.secondary {
		background: #2a2f38;
		color: #e5e7eb;
	}

	.notice {
		margin-top: 1rem;
	}

	@media (max-width: 700px) {
		.meta-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
