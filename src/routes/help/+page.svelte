<svelte:head>
	<title>Help - Nawab Auth</title>
</svelte:head>

<main class="shell">
	<section class="panel">
		<p class="eyebrow">Help</p>
		<h1>Nawab Auth help center</h1>
		<p class="lede">This is a starter template page. We can expand it into a full support center.</p>

		<div class="card-grid">
			<article class="card">
				<h2>Getting started</h2>
				<p>How to sign in, complete onboarding, and request verification.</p>
			</article>
			<article class="card">
				<h2>API key setup video</h2>
				<p>Embed the CDN setup walkthrough here for first-time SSO users.</p>
			</article>
			<article class="card">
				<h2>Troubleshooting</h2>
				<p>Common issues and links to support or escalation paths.</p>
			</article>
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

	.shell {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 2rem;
	}

	.panel {
		width: min(920px, 100%);
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
		margin: 0.5rem 0;
		font-size: clamp(1.8rem, 4vw, 2.4rem);
	}

	.lede {
		margin: 0;
		color: #cbd5e1;
	}

	.card-grid {
		margin-top: 1.25rem;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.8rem;
	}

	.card {
		padding: 1rem;
		border-radius: 0.6rem;
		border: 1px solid #2b3038;
		background: #11141a;
	}

	.card h2 {
		margin: 0;
		font-size: 1rem;
	}

	.card p {
		margin: 0.5rem 0 0;
		color: #cbd5e1;
		line-height: 1.5;
	}

	@media (max-width: 820px) {
		.card-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
