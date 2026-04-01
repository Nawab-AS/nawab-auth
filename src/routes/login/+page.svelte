<svelte:head>
	<title>Login - Nawab Auth</title>
</svelte:head>

<main class="shell">
	<section class="panel">
		<p class="eyebrow">Supabase login</p>
		<h1>Use email OTP or a linked provider.</h1>
		<p class="lede">
			This screen will eventually hand off to Supabase Auth for email OTP, MFA, Google, GitHub,
			and Discord. The canonical user ID from Supabase will power the OIDC `sub` claim.
		</p>

		<div class="stack">
			<a href="/dashboard" class="primary">Continue to dashboard</a>
			<a href="/.well-known/openid-configuration" class="secondary">View OIDC discovery</a>
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
		width: min(720px, 100%);
		padding: 2rem;
		border-radius: 0.75rem;
		border: 1px solid #2b3038;
		background: #1a1d23;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.2em;
		color: #9ca3af;
		font-size: 0.78rem;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.9rem, 5vw, 2.6rem);
		line-height: 1;
	}

	.lede {
		max-width: 60ch;
		line-height: 1.6;
		color: #cbd5e1;
	}

	.stack {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem;
		margin-top: 1.5rem;
	}

	a {
		text-decoration: none;
		border-radius: 0.5rem;
		padding: 0.9rem 1.15rem;
		font-weight: 700;
	}

	.primary {
		background: #e5e7eb;
		color: #111827;
	}

	.secondary {
		background: #2a2f38;
		color: #e5e7eb;
	}
</style>
