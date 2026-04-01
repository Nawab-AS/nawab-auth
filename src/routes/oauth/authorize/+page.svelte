<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();
</script>

<svelte:head>
	<title>Consent - Nawab Auth</title>
</svelte:head>

<main class="shell">
	<section class="panel">
		<p class="eyebrow">Authorization request</p>
		<h1>Let LibreChat access your account</h1>
		<p class="lede">
			This is the consent step for the edge OIDC provider. Supabase remains the source of truth
			for identity, MFA, and linked providers.
		</p>

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
				<span>PKCE</span>
				<strong>{data.codeChallenge ? 'Required' : 'Missing'}</strong>
			</div>
		</div>

		<ul class="scope-list">
			{#each data.scopes as scope (scope)}
				<li>{scope}</li>
			{/each}
		</ul>

		<div class="actions">
			<form method="POST" action="?/approve">
				<input type="hidden" name="redirect_uri" value={data.redirectUri} />
				<input type="hidden" name="state" value={data.state} />
				<button type="submit" class="primary">Approve</button>
			</form>

			<form method="POST" action="?/deny">
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
		max-width: 58ch;
		color: #cbd5e1;
		line-height: 1.6;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin: 1.5rem 0;
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
