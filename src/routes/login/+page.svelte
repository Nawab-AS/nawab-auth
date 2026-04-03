<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();

	let loading = $state(false);
	let otpSent = $state(false);
	let emailAddress = $state('');
	let otpCode = $state('');
	let oauthError = $state<string | null>(null);
	let sendingOtp = $state(false);
	let cooldownEndsAt = $state(0);
	let now = $state(Date.now());

	const tick = setInterval(() => {
		now = Date.now();
	}, 250);

	onDestroy(() => {
		clearInterval(tick);
	});

	let cooldownSecondsRemaining = $derived(
		cooldownEndsAt > now ? Math.ceil((cooldownEndsAt - now) / 1000) : 0
	);
	let sendOtpDisabled = $derived(sendingOtp || cooldownSecondsRemaining > 0);

	$effect(() => {
		if (form?.otpSent) {
			otpSent = true;
			emailAddress = form.email ?? emailAddress;
			otpCode = '';
		}

		if (form?.cooldownRemaining && form.cooldownRemaining > 0) {
			cooldownEndsAt = Date.now() + form.cooldownRemaining * 1000;
		}
	});

	const enhanceSendOtp: SubmitFunction = () => {
		sendingOtp = true;
		return async ({ update }) => {
			await update();
			sendingOtp = false;
		};
	};

	const enhanceVerifyOtp: SubmitFunction = () => {
		return async ({ update }) => {
			await update();
		};
	};

	function getProviderDisplayName(provider: string): string {
		const names: Record<string, string> = {
			github: 'GitHub',
			google: 'Google',
			discord: 'Discord',
			apple: 'Apple',
			facebook: 'Facebook',
			linkedin: 'LinkedIn',
			azure: 'Microsoft',
			gitlab: 'GitLab',
			bitbucket: 'Bitbucket',
			twitch: 'Twitch',
			twitter: 'X',
			slack: 'Slack',
			spotify: 'Spotify'
		};
		return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
	}

	function getProviderLogoPath(provider: string): string | null {
		const logoMap: Record<string, string> = {
			github: '/logos/github.svg',
			google: '/logos/gmail.svg',
			discord: '/logos/discord.svg'
		};
		return logoMap[provider] || null;
	}

	async function handleOAuthLogin(provider: string) {
		try {
			oauthError = null;
			const redirectUri = `${new URL(window.location.href).origin}/auth/callback`;
			const returnTo = encodeURIComponent(data.returnTo);
			const oauthUrl = new URL(`${data.supabaseUrl}/auth/v1/authorize`);
			oauthUrl.searchParams.set('provider', provider);
			oauthUrl.searchParams.set('redirect_to', redirectUri);
			oauthUrl.searchParams.set('return_to', returnTo);

			window.location.href = oauthUrl.toString();
		} catch (err) {
			oauthError = err instanceof Error ? err.message : 'OAuth login failed';
		}
	}
</script>

<svelte:head>
	<title>Login - Nawab Auth</title>
</svelte:head>

<main class="shell">
	<section class="panel">
		<p class="eyebrow">Authentication</p>
		<h1>Sign In</h1>

		{#if oauthError}
			<p class="error-message">{oauthError}</p>
		{/if}

		<!-- OAuth Providers -->
		{#if data.oauthSettings.providers.length > 0}
			<div class="oauth-section">
				<p class="section-label">Sign in with</p>
				<div class="oauth-buttons">
					{#each data.oauthSettings.providers as provider (provider)}
						<button
							type="button"
							class="oauth-btn"
							onclick={() => handleOAuthLogin(provider)}
							disabled={loading}
							title={getProviderDisplayName(provider)}
						>
							{#if getProviderLogoPath(provider)}
								<img src={getProviderLogoPath(provider)} alt={getProviderDisplayName(provider)} />
							{:else}
								<span class="provider-icon">{getProviderDisplayName(provider).charAt(0)}</span>
							{/if}
							<span class="provider-name">{getProviderDisplayName(provider)}</span>
						</button>
					{/each}
				</div>
				{#if data.oauthSettings.emailEnabled}
					<div class="divider">or</div>
				{/if}
			</div>
		{/if}

		<!-- Email OTP Authentication -->
		{#if data.oauthSettings.emailEnabled}
			<div class="email-section">
				<form method="POST" action="?/sendOtp" use:enhance={enhanceSendOtp} class="form-stack">
					<input type="hidden" name="return_to" value={data.returnTo} />
					{#if !otpSent}
						<label>
							<span>Email</span>
							<input
								type="email"
								name="email"
								required
								autocomplete="email"
								bind:value={emailAddress}
								readonly={sendingOtp}
							/>
						</label>
					{:else}
						<input type="hidden" name="email" value={emailAddress} />
						<p class="otp-email-text">Code sent to {emailAddress}</p>
					{/if}

					{#if form?.message && !form?.token}
						{#if !form?.otpSent}
							<p class="error-message">{form.message}</p>
						{/if}
					{/if}

					<button type="submit" class="primary" disabled={sendOtpDisabled} aria-busy={sendingOtp}>
						{#if sendingOtp}
							Sending code...
						{:else if cooldownSecondsRemaining > 0}
							Resend in {cooldownSecondsRemaining}s
						{:else}
							{otpSent ? 'Resend OTP' : 'Send code'}
						{/if}
					</button>
				</form>

				{#if otpSent}
					<form method="POST" action="?/verifyOtp" use:enhance={enhanceVerifyOtp} class="form-stack verify-form">
						<input type="hidden" name="return_to" value={data.returnTo} />
						<input type="hidden" name="email" value={emailAddress} />
						<label>
							<span>Verification code</span>
							<input
								type="text"
								name="token"
								required
								inputmode="numeric"
								autocomplete="one-time-code"
								maxlength="6"
								placeholder="123456"
								bind:value={otpCode}
							/>
						</label>
						{#if form?.message && !form?.otpSent}
							<p class="error-message">{form.message}</p>
						{:else}
							<p class="success-message">Enter the 6-digit code from your email to finish sign in.</p>
						{/if}
						<button type="submit" class="primary" disabled={loading}>Verify code</button>
					</form>
				{/if}
			</div>
		{/if}

		{#if !data.oauthSettings.emailEnabled && data.oauthSettings.providers.length === 0}
			<p class="warning">No authentication methods available. Please configure OAuth or email in Supabase.</p>
		{/if}

		<p class="footer-text">All authentication methods are configured through Supabase.</p>
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
		width: min(480px, 100%);
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
		margin: 0.5rem 0 1.5rem;
		font-size: clamp(1.9rem, 5vw, 2.2rem);
		font-weight: 700;
		line-height: 1;
	}

	.oauth-section {
		margin-bottom: 1.5rem;
	}

	.email-section {
		margin-bottom: 1.5rem;
	}

	.verify-form {
		margin-top: 1rem;
	}

	.section-label {
		color: #9ca3af;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin: 0 0 0.75rem;
	}

	.oauth-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.oauth-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: #2a2f38;
		color: #e5e7eb;
		border: 1px solid #3a4048;
		border-radius: 0.5rem;
		padding: 0.7rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		flex: 1;
		min-width: 120px;
	}

	.oauth-btn:hover:not(:disabled) {
		background: #3a4048;
		border-color: #4a5058;
		transform: translateY(-1px);
	}

	.oauth-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.provider-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.2rem;
		height: 1.2rem;
		background: #0f1115;
		border-radius: 0.25rem;
		font-weight: 700;
		font-size: 0.65rem;
	}

	.oauth-btn img {
		width: 1.2rem;
		height: 1.2rem;
		object-fit: contain;
	}

	.provider-name {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.divider {
		text-align: center;
		color: #6b7280;
		font-size: 0.85rem;
		margin: 1rem 0;
		position: relative;
	}

	.divider::before,
	.divider::after {
		content: '';
		position: absolute;
		top: 50%;
		width: 40%;
		height: 1px;
		background: #2b3038;
	}

	.divider::before {
		left: 0;
	}

	.divider::after {
		right: 0;
	}

	.form-stack {
		display: grid;
		gap: 0.9rem;
	}

	label {
		display: grid;
		gap: 0.45rem;
	}

	label span {
		color: #9ca3af;
		font-size: 0.9rem;
		font-weight: 500;
	}

	input {
		background: #11141a;
		color: #e5e7eb;
		border: 1px solid #2b3038;
		border-radius: 0.5rem;
		padding: 0.7rem 0.8rem;
		font: inherit;
		transition: border-color 0.2s;
	}

	input:focus {
		outline: none;
		border-color: #3b82f6;
	}

	input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	button[type='submit'].primary {
		background: #3b82f6;
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		padding: 0.8rem 1.2rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	button[type='submit'].primary:hover:not(:disabled) {
		background: #2563eb;
	}

	button[type='submit'].primary:disabled {
		background: #4b5563;
		cursor: not-allowed;
		opacity: 0.6;
	}

	.success-message {
		color: #86efac;
		background: #065f46;
		border: 1px solid #10b981;
		padding: 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.9rem;
		margin: 0;
	}

	.error-message {
		color: #fca5a5;
		background: #7f1d1d;
		border: 1px solid #dc2626;
		padding: 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.9rem;
		margin: 0;
	}

	.warning {
		color: #fde047;
		background: #713f12;
		border: 1px solid #d97706;
		padding: 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.9rem;
		margin: 0 0 1rem;
	}

	.otp-email-text {
		font-size: 0.85rem;
		color: #9ca3af;
		margin: 0;
	}

	.footer-text {
		color: #6b7280;
		font-size: 0.85rem;
		margin-top: 1.5rem;
		text-align: center;
	}
</style>
