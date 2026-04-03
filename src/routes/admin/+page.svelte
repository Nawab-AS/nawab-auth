<svelte:head>
	<title>Admin Dashboard - Nawab Auth</title>
</svelte:head>

<main class="page">
	<section class="panel">
		<p class="eyebrow">Admin dashboard template</p>
		<h1>Admin controls will live here.</h1>
		<p class="lede">
			This page is currently a placeholder for admin-only workflows, reporting, and governance
			controls.
		</p>

		<div class="callout">
			<p>Use the dashboard to return to your user view while this template is being built out.</p>
			<a href="/dashboard" class="primary-link">Back to dashboard</a>
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
		max-width: 1040px;
		margin: 0 auto;
		display: grid;
		place-items: center;
	}

	.panel {
		width: 100%;
		max-width: 760px;
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
		line-height: 1.1;
	}

	.lede {
		color: #cbd5e1;
		line-height: 1.6;
		max-width: 58ch;
	}

	.callout {
		display: grid;
		gap: 1rem;
		margin-top: 1.5rem;
		padding: 1.25rem;
		border-radius: 0.6rem;
		background: #15181e;
		border: 1px solid #2b3038;
	}

	.callout p {
		margin: 0;
		color: #cbd5e1;
		line-height: 1.6;
	}

	.primary-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: fit-content;
		border-radius: 0.5rem;
		padding: 0.9rem 1.2rem;
		font: inherit;
		font-weight: 700;
		text-decoration: none;
		background: #e5e7eb;
		color: #111827;
	}
</style>
