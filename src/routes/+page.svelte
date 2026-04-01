<script lang="ts">
	import * as paths from '$app/paths';
</script>

<svelte:head>
	<title>Nawab Auth</title>
	<meta name="description" content="Nawab Auth" />
</svelte:head>

<main class="page">
	<h1>Nawab Auth</h1>
	<a href={paths.resolve('/login')} class="login-link">Login</a>
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
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
	}

	h1 {
		margin: 0;
		font-size: clamp(2.2rem, 8vw, 3.5rem);
		font-weight: 700;
	}

	.login-link {
		text-decoration: none;
		background: #e5e7eb;
		color: #111827;
		padding: 0.75rem 1.25rem;
		border-radius: 0.5rem;
		font-weight: 600;
	}
</style>
