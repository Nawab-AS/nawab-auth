<svelte:head>
	<title>Terms of Service - Nawab Auth</title>
</svelte:head>

<main class="shell">
	<section class="panel">
		<p class="eyebrow">Terms of Service</p>
		<h1>Acceptable Use Policy</h1>
		<p>
			By accessing or using Nawab Auth, you agree to comply with all applicable laws,
			regulations, and institutional policies. You are solely responsible for your conduct and for
			ensuring that your use of this service is lawful, ethical, and authorized.
		</p>
		<p>
			You may not use this service to engage in unlawful conduct, fraud, impersonation, abuse,
			security violations, or any activity intended to deceive, exploit, or harm others.
		</p>
		<p>
			Academic dishonesty is strictly prohibited. This includes, without limitation, unauthorized
			assistance on examinations or assignments, plagiarism, falsification of academic work,
			misrepresentation of authorship, or any use that violates academic integrity standards.
		</p>
		<p>
			Use of Nawab Auth is provided on an "as is" and "as available" basis. By using this service,
			you acknowledge and accept all associated risks, and you agree that Nawab Auth and its
			creators are not liable for losses, damages, disciplinary outcomes, or other adverse
			consequences arising from misuse of the service.
		</p>
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
		min-height: 100dvh;
		width: 100%;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		padding: 2rem;
	}

	.panel {
		width: min(760px, 100%);
		box-sizing: border-box;
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

	p {
		color: #cbd5e1;
		line-height: 1.65;
	}
</style>
