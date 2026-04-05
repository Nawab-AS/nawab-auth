<script lang="ts">
	import { onMount } from 'svelte';

	let error = $state<string | null>(null);
	let loading = $state(true);

	onMount(async () => {
		const redirectToLogin = (message: string) => {
			window.location.href = `/login?error=${encodeURIComponent(message)}`;
		};

		try {
			// Extract the fragment data that Supabase sends back
			const hash = window.location.hash.substring(1);
			if (!hash) {
				throw new Error('No authentication data received');
			}

			// Parse the fragment
			const params = new URLSearchParams(hash);
			const accessToken = params.get('access_token');
			const refreshToken = params.get('refresh_token');
			const expiresIn = params.get('expires_in');
			const type = params.get('type');

			// Also check URL query params for OTP verification
			const urlParams = new URLSearchParams(window.location.search);
			const token = urlParams.get('token');
			const tokenType = urlParams.get('type');

			if (!accessToken && !token) {
				throw new Error('No authentication token found');
			}

			// Send the tokens to the server for validation and cookie setting
			const response = await fetch('/auth/callback/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					accessToken,
					refreshToken,
					expiresIn,
					type,
					otpToken: token,
					otpType: tokenType
				})
			});

			if (!response.ok) {
				const data = await response.json();
				redirectToLogin(data.error || 'Authentication failed');
				return;
			}

			// Get the redirect URL from the response
			const result = await response.json();
			window.location.href = result.redirectTo || '/dashboard';
		} catch (err) {
			redirectToLogin(err instanceof Error ? err.message : 'Authentication failed');
		}
	});
</script>

<svelte:head>
	<title>Authenticating...</title>
</svelte:head>

<main>
	{#if loading}
		<p>Authenticating...</p>
	{:else}
		<p class="error">{error}</p>
	{/if}
</main>

<style>
	main {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: #0f1115;
		color: #e5e7eb;
		font-family: 'Segoe UI', sans-serif;
	}

	p {
		font-size: 1.1rem;
	}

	.error {
		color: #fca5a5;
	}
</style>
