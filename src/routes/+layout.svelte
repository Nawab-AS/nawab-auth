<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<footer class="footer">
	<p>&copy; 2026 Nawab Auth. All rights reserved.</p>
</footer>
<style>
	.footer {
		text-align: center;
		background-color: #0f1115;
		color: #666;
		font-size: 0.9rem;
		margin-top: 2rem;
	}

	:global(body) {
		margin: 0;
		background: #0f1115;
		color: #e5e7eb;
		font-family: 'Segoe UI', sans-serif;
	}
</style>