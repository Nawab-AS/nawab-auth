<script lang="ts">
	import { onMount } from 'svelte';

	let error = $state<string | null>(null);
	let loading = $state(true);

	onMount(async () => {
		const redirectToLogin = (message: string, returnTo?: string) => {
			const loginUrl = new URL('/login', window.location.origin);
			loginUrl.searchParams.set('error', message);
			if (returnTo && returnTo.startsWith('/')) {
				loginUrl.searchParams.set('redirect_to', returnTo);
			}
			window.location.href = loginUrl.toString();
		};

		try {
			const urlParams = new URLSearchParams(window.location.search);
			const returnTo = urlParams.get('redirect_to') ?? urlParams.get('return_to') ?? '/dashboard';
			const email = urlParams.get('email');
			const token = urlParams.get('token');
			const tokenType = urlParams.get('type');

			// Supabase OAuth usually sends tokens in the fragment.
			// OTP verification uses query params instead.
			const hash = window.location.hash.substring(1);
			const params = new URLSearchParams(hash);
			const accessToken = params.get('access_token');
			const refreshToken = params.get('refresh_token');
			const expiresIn = params.get('expires_in');
			const type = params.get('type');
			const oauthError = params.get('error_description') ?? params.get('error');

			if (oauthError) {
				throw new Error(oauthError);
			}

			if (!accessToken && !token) {
				throw new Error('No authentication token found');
			}

			// Send the tokens to the server for validation and cookie setting
			const verifyUrl = new URL('/auth/callback/verify', window.location.origin);
			verifyUrl.searchParams.set('redirect_to', returnTo);
			if (email) {
				verifyUrl.searchParams.set('email', email);
			}

			const response = await fetch(verifyUrl.toString(), {
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
				redirectToLogin(data.error || 'Authentication failed', returnTo);
				return;
			}

			// Get the redirect URL from the response
			const result = await response.json();
			window.location.href = result.redirectTo || '/dashboard';
		} catch (err) {
			const params = new URLSearchParams(window.location.search);
			redirectToLogin(
				err instanceof Error ? err.message : 'Authentication failed',
				params.get('redirect_to') ?? params.get('return_to') ?? undefined
			);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Authenticating...</title>
</svelte:head>

<main>
	{#if loading}
		<h1>Authenticating...</h1>
	{:else}
		<h1 class="error">{error}</h1>
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

	h1 {
		font-size: 1.1rem;
	}

	.error {
		color: #fca5a5;
	}
</style>
