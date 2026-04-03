<svelte:head>
	<title>Terms of Service - Nawab Auth</title>
</svelte:head>

<main class="shell">
	<section class="panel">
		<p class="eyebrow">Terms of Service</p>
		<h1>Use Policy</h1>
		<p>
			By using this service, you agree not to use it for illegal activity, including misuse that
			violates applicable law or institutional policy, and not to use it for academic dishonesty.
		</p>
		<p>
			You also acknowledge that use is at your own risk, and you release LibreChat, Nawab Auth,
			and the creators from responsibility for adverse outcomes resulting from misuse or reliance
			on this service.
		</p>
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
		border-radius: 0.75rem;
		border: 1px solid #2b3038;
		background: #1a1d23;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.2em;
		color: #9ca3af;
		font-size: 0.75rem;
		margin: 0;
	}

	h1 {
		margin: 0.5rem 0 1rem;
		font-size: clamp(1.8rem, 4vw, 2.2rem);
	}

	p {
		color: #cbd5e1;
		line-height: 1.65;
	}
</style>
