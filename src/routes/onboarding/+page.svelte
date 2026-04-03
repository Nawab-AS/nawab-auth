<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();
	let preferredName = $state('');

	$effect(() => {
		if (form?.preferredName !== undefined) {
			preferredName = form.preferredName;
		}
	});
</script>

<svelte:head>
	<title>Onboarding - Nawab Auth</title>
</svelte:head>

<main class="shell">
	<section class="panel">
		<p class="eyebrow">Onboarding</p>
		<h1>Finish setting up your account</h1>
		<p class="lede">This account will be linked to <strong>{data.email}</strong>.</p>

		<p class="banner">
			Preferred name changes are handled manually. Email
			<a href={`mailto:${data.supportEmail}`}>{data.supportEmail}</a>
			if you need to update it later.
		</p>

		<form method="POST" class="form-stack">
			<label>
				<span>Preferred name</span>
				<input
					type="text"
					name="preferred_name"
					required
					maxlength="80"
					autocomplete="name"
					bind:value={preferredName}
					placeholder="Your display name"
				/>
			</label>

			<label class="checkbox-row">
				<input type="checkbox" name="accept_tos" required />
				<span>
					I agree to the
					<a href={resolve('/terms')} target="_blank" rel="noopener noreferrer">Terms of Service</a>.
				</span>
			</label>

			{#if form?.message}
				<p class="error-message">{form.message}</p>
			{/if}

			<button type="submit" class="primary">Complete Registration</button>
		</form>
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
		width: min(560px, 100%);
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

	.lede {
		margin: 0 0 1rem;
		color: #cbd5e1;
	}

	.banner {
		background: #111827;
		border: 1px solid #334155;
		color: #cbd5e1;
		border-radius: 0.5rem;
		padding: 0.75rem;
		font-size: 0.9rem;
	}

	.banner a {
		color: #93c5fd;
	}

	.form-stack {
		display: grid;
		gap: 0.9rem;
		margin-top: 1rem;
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

	input[type='text'] {
		background: #11141a;
		color: #e5e7eb;
		border: 1px solid #2b3038;
		border-radius: 0.5rem;
		padding: 0.7rem 0.8rem;
		font: inherit;
	}

	.checkbox-row {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
	}

	.checkbox-row input {
		margin-top: 0.2rem;
	}

	.checkbox-row a {
		color: #93c5fd;
	}

	.primary {
		background: #3b82f6;
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		padding: 0.8rem 1.2rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
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
</style>
