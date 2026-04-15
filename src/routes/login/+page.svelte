<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy, onMount } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';

	type LoginPageData = PageData & {
		error?: string | null;
		authError?: string | null;
		signedIn?: boolean;
		oidcGate?: {
			isVerified: boolean;
			onboarded: boolean;
			firstSsoCompleted: boolean;
			videoWatched: boolean;
			hasApiKey: boolean;
			apiKeyDisabled: boolean;
			canProceedToOidc: boolean;
			canManageAfterPrerequisites: boolean;
		};
	};

	let { data, form }: { data: LoginPageData; form: ActionData | undefined } = $props();

	let loading = $state(false);
	let otpSent = $state(false);
	let emailAddress = $state('');
	let otpCode = $state('');
	let oauthError = $state<string | null>(null);
	let returnToFromLocation = $state('');
	let sendingOtp = $state(false);
	let verifyingOtp = $state(false);
	let gateActionBusy = $state(false);
	let generatedApiKey = $state<string | null>(null);
	let copied = $state(false);
	let cooldownEndsAt = $state(0);
	let now = $state(Date.now());

	function buildDeniedReturnUrl(returnTo: string, authOrigin: string): string | null {
		if (!returnTo.startsWith('/oauth/authorize')) {
			return null;
		}

		try {
			const authorizeUrl = new URL(returnTo, authOrigin);
			const redirectUri = authorizeUrl.searchParams.get('redirect_uri');
			const state = authorizeUrl.searchParams.get('state');

			if (!redirectUri || !state) {
				return null;
			}

			const clientUrl = new URL(redirectUri);
			clientUrl.searchParams.set('error', 'access_denied');
			clientUrl.searchParams.set('error_description', 'could_not_login_unverified_account');
			clientUrl.searchParams.set('login_status', 'could_not_login');
			clientUrl.searchParams.set('deny_reason', 'unverified_account');
			clientUrl.searchParams.set('state', state);

			return clientUrl.toString();
		} catch {
			return null;
		}
	}

	function isGenericReturnToPath(value: string | null | undefined) {
		return value === '/' || value === '/dashboard';
	}

	onMount(() => {
		const parsed = new URL(window.location.href);
		const fromUrl = parsed.searchParams.get('redirect_to') ?? parsed.searchParams.get('return_to');
		const resolvedReturnTo =
			fromUrl && fromUrl.startsWith('/') && !isGenericReturnToPath(fromUrl) ? fromUrl : data.returnTo;
		returnToFromLocation = resolvedReturnTo;

		const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);
		const hasOAuthHashPayload =
			Boolean(hashParams.get('access_token')) ||
			Boolean(hashParams.get('error')) ||
			Boolean(hashParams.get('error_description'));

		if (hasOAuthHashPayload) {
			const callbackUrl = new URL('/auth/callback', window.location.origin);
			callbackUrl.searchParams.set('redirect_to', resolvedReturnTo);
			window.location.replace(`${callbackUrl.toString()}${parsed.hash}`);
		}
	});

	const tick = setInterval(() => {
		now = Date.now();
	}, 250);

	onDestroy(() => {
		clearInterval(tick);
	});

	let cooldownSecondsRemaining = $derived(
		cooldownEndsAt > now ? Math.ceil((cooldownEndsAt - now) / 1000) : 0
	);
	let resolvedReturnTo = $derived(returnToFromLocation || data.returnTo);
	let sendOtpAction = $derived(`?/sendOtp`);
	let verifyOtpAction = $derived(`?/verifyOtp`);
	let sendOtpDisabled = $derived(sendingOtp || cooldownSecondsRemaining > 0);
	let otpProcessing = $derived(sendingOtp || verifyingOtp);
	let pageError = $derived(data.error ?? data.authError ?? null);
	let isSignedInGateMode = $derived(Boolean(data.signedIn));
	let gateState = $derived(form?.oidcGate ?? data.oidcGate ?? null);
	let gateMessage = $derived(
		typeof form?.gateMessage === 'string' ? form.gateMessage : null
	);
	let unverifiedReturnUrl = $derived(buildDeniedReturnUrl(resolvedReturnTo, data.authOrigin));

	const enhanceSendOtp: SubmitFunction = () => {
		sendingOtp = true;
		return async ({ update, result }) => {
			await update();
			sendingOtp = false;

			if (result.type === 'success') {
				otpSent = true;
				if (result.data?.email && typeof result.data.email === 'string') {
					emailAddress = result.data.email;
				}
				otpCode = '';
			}

			if (
				(result.type === 'success' || result.type === 'failure') &&
				result.data?.cooldownRemaining &&
				typeof result.data.cooldownRemaining === 'number' &&
				result.data.cooldownRemaining > 0
			) {
				cooldownEndsAt = Date.now() + result.data.cooldownRemaining * 1000;
			}
		};
	};

	const enhanceVerifyOtp: SubmitFunction = () => {
		verifyingOtp = true;
		return async ({ update }) => {
			await update();
			verifyingOtp = false;
		};
	};

	const enhanceGateAction: SubmitFunction = () => {
		gateActionBusy = true;
		return async ({ update, result }) => {
			await update();
			gateActionBusy = false;

			if (
				(result.type === 'success' || result.type === 'failure') &&
				typeof result.data?.generatedApiKey === 'string'
			) {
				generatedApiKey = result.data.generatedApiKey;
				copied = false;
			}
		};
	};

	function goToConsent() {
		window.location.href = resolvedReturnTo;
	}

	async function copyGeneratedKey() {
		if (!generatedApiKey) {
			return;
		}

		try {
			await navigator.clipboard.writeText(generatedApiKey);
			copied = true;
		} catch {
			copied = false;
		}
	}

	function dismissGeneratedKey() {
		generatedApiKey = null;
		copied = false;
	}

	function getProviderDisplayName(provider: string): string {
		const names: Record<string, string> = {
			github: 'GitHub',
			google: 'Google',
			discord: 'Discord',
			apple: 'Apple',
			linkedin: 'LinkedIn',
			azure: 'Microsoft',
			gitlab: 'GitLab',
			bitbucket: 'Bitbucket',
		};
		return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
	}

	function getProviderLogoPath(provider: string): string | null {
		const logoMap: Record<string, string> = {
			github: '/logos/github.svg',
			google: '/logos/google.svg',
			discord: '/logos/discord.svg'
		};
		return logoMap[provider] || null;
	}

	async function handleOAuthLogin(provider: string) {
		try {
			loading = true;
			oauthError = null;
			const redirectUri = new URL('/auth/callback', window.location.origin);
			redirectUri.searchParams.set('redirect_to', resolvedReturnTo);
			const oauthUrl = new URL(`${data.supabaseUrl}/auth/v1/authorize`);
			oauthUrl.searchParams.set('provider', provider);
			oauthUrl.searchParams.set('redirect_to', redirectUri.toString());

			window.location.href = oauthUrl.toString();
		} catch (err) {
			loading = false;
			oauthError = err instanceof Error ? err.message : 'OAuth login failed';
		}
	}
</script>

<svelte:head>
	<title>Login - Nawab Auth</title>
</svelte:head>

<main class="shell">
	<section class="panel">
		{#if isSignedInGateMode && gateState}
			<p class="eyebrow">OIDC preflight</p>
			<h1>Finish key setup</h1>

			{#if pageError}
				<p class="error-message">{pageError}</p>
			{/if}

			{#if gateMessage}
				<p class="success-message">{gateMessage}</p>
			{/if}

			{#if !gateState.onboarded}
				<p class="warning">Complete onboarding first. Terms acceptance is required before OIDC sign-in.</p>
			{:else if !gateState.isVerified}
				<p class="warning">Your account is not verified yet. Ask an admin to verify your account first.</p>
				{#if unverifiedReturnUrl}
					<div class="dialog-panel">
						<button type="button" class="secondary-btn" onclick={() => (window.location.href = unverifiedReturnUrl)}>
							Go back
						</button>
					</div>
				{/if}
			{/if}

			{#if gateState.canManageAfterPrerequisites && !gateState.hasApiKey}
				<div class="dialog-panel">
					<p class="section-label">Generate API key</p>
					<p class="footer-text">No key exists yet. Generate one now to continue to consent.</p>
					<form method="POST" action="?/generateApiKey" use:enhance={enhanceGateAction} class="form-stack">
						<input type="hidden" name="redirect_to" value={resolvedReturnTo} />
						<button type="submit" class="primary" disabled={gateActionBusy}>
							{gateActionBusy ? 'Generating...' : 'Generate API key'}
						</button>
					</form>

					{#if generatedApiKey}
						<div class="key-once">
							<p class="section-label">Shown once</p>
							<code>{generatedApiKey}</code>
							<div class="inline-actions">
								<button type="button" class="secondary-btn" onclick={copyGeneratedKey}>
									{copied ? 'Copied' : 'Copy key'}
								</button>
								<button type="button" class="secondary-btn" onclick={dismissGeneratedKey}>Hide</button>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			{#if gateState.canManageAfterPrerequisites && gateState.hasApiKey && gateState.apiKeyDisabled}
				<div class="dialog-panel">
					<p class="section-label">API key disabled</p>
					<p class="footer-text">Your key is currently disabled. Enable it to continue with OIDC login.</p>
					<form method="POST" action="?/enableApiKey" use:enhance={enhanceGateAction} class="form-stack">
						<input type="hidden" name="redirect_to" value={resolvedReturnTo} />
						<button type="submit" class="primary" disabled={gateActionBusy}>
							{gateActionBusy ? 'Enabling...' : 'Enable API key'}
						</button>
					</form>
				</div>
			{/if}

			{#if gateState.canProceedToOidc}
				<div class="dialog-panel">
					<p class="section-label">Ready</p>
					<p class="footer-text">Your API key is active. Continue to the consent screen.</p>
					<button type="button" class="primary" onclick={goToConsent}>Continue to consent</button>
				</div>
			{/if}
		{:else}
			<p class="eyebrow">Authentication</p>
			<h1>Sign In</h1>

			{#if pageError}
				<p class="error-message">{pageError}</p>
			{/if}

			{#if oauthError}
				<p class="error-message">{oauthError}</p>
			{/if}

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

			{#if data.oauthSettings.emailEnabled}
				<div class="email-section">
					{#if otpProcessing}
						<div class="processing-indicator" role="status" aria-live="polite">
							<span class="spinner" aria-hidden="true"></span>
							<span>{sendingOtp ? 'Sending your code...' : 'Verifying your code...'}</span>
						</div>
					{/if}

					<form method="POST" action={sendOtpAction} use:enhance={enhanceSendOtp} class="form-stack">
						<input type="hidden" name="redirect_to" value={resolvedReturnTo} />
						{#if !otpSent}
							<label>
								<span>Email</span>
								<input
									type="email"
									name="email"
									required
									autocomplete="email"
									bind:value={emailAddress}
									readonly={otpProcessing}
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
								{otpSent || form?.otpSent ? 'Resend OTP' : 'Send code'}
							{/if}
						</button>
					</form>

					{#if otpSent || form?.otpSent}
						<form method="POST" action={verifyOtpAction} use:enhance={enhanceVerifyOtp} class="form-stack verify-form">
							<input type="hidden" name="redirect_to" value={resolvedReturnTo} />
							<input type="hidden" name="email" value={emailAddress || form?.email || ''} />
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
									readonly={verifyingOtp}
									bind:value={otpCode}
								/>
							</label>
							{#if form?.message && form?.token}
								<p class="error-message">{form.message}</p>
							{:else if form?.message}
								<p class="success-message">{form.message}</p>
							{:else}
								<p class="success-message">Enter the 6-digit code from your email to finish sign in.</p>
							{/if}
							<button type="submit" class="primary" disabled={loading || verifyingOtp} aria-busy={verifyingOtp}>
								{verifyingOtp ? 'Verifying...' : 'Verify code'}
							</button>
						</form>
					{/if}
				</div>
			{/if}

			{#if !data.oauthSettings.emailEnabled && data.oauthSettings.providers.length === 0}
				<p class="warning">No authentication methods available. Please configure OAuth or email in Supabase.</p>
			{/if}

			<p class="footer-text">All authentication methods are configured through Supabase.</p>
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

	.processing-indicator {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		background: #1f2937;
		border: 1px solid #374151;
		border-radius: 999px;
		color: #d1d5db;
		font-size: 0.85rem;
		padding: 0.35rem 0.7rem;
		margin-bottom: 0.8rem;
	}

	.spinner {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 999px;
		border: 2px solid #4b5563;
		border-top-color: #e5e7eb;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
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

	.dialog-panel {
		display: grid;
		gap: 0.75rem;
		padding: 0.95rem;
		border-radius: 0.5rem;
		border: 1px solid #334155;
		background: #101822;
		margin-bottom: 1rem;
	}

	.key-once {
		display: grid;
		gap: 0.6rem;
		padding: 0.75rem;
		border-radius: 0.4rem;
		border: 1px solid #475569;
		background: #0f172a;
	}

	.key-once code {
		display: block;
		padding: 0.6rem;
		border-radius: 0.35rem;
		background: #020617;
		color: #e2e8f0;
		font-size: 0.82rem;
		overflow-x: auto;
	}

	.inline-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.secondary-btn {
		background: #1e293b;
		color: #e2e8f0;
		border: 1px solid #334155;
		border-radius: 0.45rem;
		padding: 0.55rem 0.85rem;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	.secondary-btn:hover {
		background: #334155;
	}
</style>
