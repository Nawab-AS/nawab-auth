<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();
	let watchedInSession = $state(false);

	const mustWatchVideo = $derived(!data.ssoState.firstSsoCompleted && !data.ssoState.videoWatched);
	const videoWatched = $derived(data.ssoState.videoWatched || data.ssoState.firstSsoCompleted || watchedInSession);
	const approveDisabled = $derived(!data.ssoState.isVerified || (mustWatchVideo && !videoWatched));
</script>

<svelte:head>
	<title>Consent - Nawab Auth</title>
</svelte:head>

<main class="shell">
	<section class="panel">
		<p class="eyebrow">Permission request</p>
		<h1>Share your account details?</h1>
		<p class="lede">{data.clientId} is requesting access to continue sign-in.</p>

		<div class="share-card" aria-live="polite">
			<p class="share-title">This app can see</p>
			<ul class="claim-list">
				{#each data.consent.sharedClaims as claim (claim)}
					<li>{claim}</li>
				{/each}
			</ul>
			<p class="share-note">Only these details are shared. Your password and OTP are never shared.</p>
		</div>

		<p class="scope-label">Requested permissions</p>
		<ul class="scope-list" aria-label="Requested permissions">
			{#each data.scopes as scope (scope)}
				<li>{scope === 'openid' ? 'Sign you in' : scope.replace('_', ' ')}</li>
			{/each}
		</ul>

		{#if !data.ssoState.isVerified}
			<p class="notice">Your account is unverified. An admin must verify your account before you can approve SSO.</p>
		{:else if mustWatchVideo}
			<div class="share-card">
				<p class="share-title">First-time setup required</p>
				<p class="share-note">Watch this setup video before approving. The API key will be automatically generated.</p>
				<video controls preload="metadata" onended={() => (watchedInSession = true)}>
					<source src="https://cdn.example.com/nawab-key-setup.mp4" type="video/mp4" />
					Your browser does not support video playback.
				</video>
				<p class="share-note">{videoWatched ? 'Video watched. You can approve now.' : 'Watch the video first to enable approve.'}</p>
			</div>
		{/if}

		<div class="actions">
			<form method="POST" action="?/approve">
				<input type="hidden" name="client_id" value={data.clientId} />
				<input type="hidden" name="scope" value={data.scopes.join(' ')} />
				<input type="hidden" name="nonce" value={data.nonce} />
				<input type="hidden" name="code_challenge" value={data.codeChallenge} />
				<input type="hidden" name="redirect_uri" value={data.redirectUri} />
				<input type="hidden" name="state" value={data.state} />
				<input type="hidden" name="watched_video" value={videoWatched ? 'true' : 'false'} />
				<button type="submit" class="primary" disabled={approveDisabled}>
					{approveDisabled && mustWatchVideo ? 'Watch the video first' : 'Approve'}
				</button>
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
		margin-bottom: 1.2rem;
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

	.scope-label {
		margin: 0 0 0.6rem;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: #9ca3af;
	}

	.notice {
		display: block;
		color: #9ca3af;
		font-size: 0.9rem;
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

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	video {
		width: 100%;
		border-radius: 0.5rem;
		border: 1px solid #334155;
		background: #000;
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

</style>
