<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();

	type FilterMode = 'all' | 'admin' | 'banned' | 'unverified' | 'no-key';

	let query = $state('');
	let filterMode = $state<FilterMode>('all');
	let toastMessage = $state('');
	let showToast = $state(false);
	let toastTimeout: ReturnType<typeof setTimeout> | null = null;

	const normalizedQuery = $derived(query.trim().toLowerCase());

	const totalUsers = $derived(data.users.length);
	const totalAdmins = $derived(data.users.filter((row) => row.isAdmin).length);
	const totalBanned = $derived(data.users.filter((row) => row.banned).length);
	const totalUnverified = $derived(data.users.filter((row) => row.userState === 'unverified').length);
	const totalDisabledKeys = $derived(data.users.filter((row) => row.apiKeyDisabled).length);

	const filteredUsers = $derived(
		data.users.filter((row) => {
			if (filterMode === 'admin' && !row.isAdmin) {
				return false;
			}

			if (filterMode === 'banned' && !row.banned) {
				return false;
			}

			if (filterMode === 'unverified' && row.userState !== 'unverified') {
				return false;
			}

			if (filterMode === 'no-key' && row.apiKeyAssigned) {
				return false;
			}

			if (!normalizedQuery) {
				return true;
			}

			const email = data.emailByUserId[row.userId] ?? '';
			return [row.userId, row.preferredName ?? '', email].some((value) =>
				value.toLowerCase().includes(normalizedQuery)
			);
		})
	);

	const selectedRow = $derived(data.users.find((row) => row.userId === data.selectedUserId) ?? null);
	const selectedEmail = $derived(
		data.selectedUserId ? (data.emailByUserId[data.selectedUserId] ?? null) : null
	);

	const apiKeyStateLabel = $derived.by(() => {
		if (!selectedRow) {
			return 'No user selected';
		}

		if (!selectedRow.apiKeyAssigned) {
			return 'Not assigned';
		}

		if (selectedRow.apiKeyDisabled) {
			return 'Disabled';
		}

		return 'Assigned';
	});

	const remainingCredits = $derived.by(() => {
		if (!data.selectedUser) {
			return 0;
		}

		return (
			data.selectedUser.allowedUsageUsd -
			data.selectedUser.usageCarriedForwardUsd -
			data.selectedUser.currentUsageUsd
		);
	});

	function getApiKeyState(assigned: boolean, disabled: boolean): string {
		if (!assigned) {
			return 'Not assigned';
		}

		if (disabled) {
			return 'Disabled';
		}

		return 'Assigned';
	}

	function getUsageTone(remaining: number) {
		if (remaining <= 0) {
			return 'danger';
		}

		if (remaining < 10) {
			return 'warn';
		}

		return 'ok';
	}

	function showSuccessToastMessage(message: string) {
		toastMessage = message;
		showToast = true;

		if (toastTimeout) {
			clearTimeout(toastTimeout);
		}

		toastTimeout = setTimeout(() => {
			showToast = false;
			toastTimeout = null;
		}, 2600);
	}

	onDestroy(() => {
		if (toastTimeout) {
			clearTimeout(toastTimeout);
		}
	});

	const enhanceAdminAction: SubmitFunction = () => {
		return async ({ update, result }) => {
			await update();

			if (result.type === 'success' && typeof result.data?.actionMessage === 'string') {
				showSuccessToastMessage(result.data.actionMessage);
			}
		};
	};
</script>

<svelte:head>
	<title>Admin Dashboard - Nawab Auth</title>
</svelte:head>

<main class="page">
	{#if showToast}
		<div class="toast" role="status" aria-live="polite">{toastMessage}</div>
	{/if}

	<section class="panel shell-grid">
		<header class="hero">
			<div class="hero-copy">
				<br/>
				<h1 class="eyebrow">Admin dashboard</h1>
				<br/>
			</div>
			<form method="GET" action="/dashboard" class="hero-actions">
				<button type="submit" class="ghost-link">Back to dashboard</button>
			</form>
		</header>

		<section class="metric-grid" aria-label="Admin metrics">
			<article>
				<p>Users</p>
				<strong>{totalUsers}</strong>
			</article>
			<article>
				<p>Admins</p>
				<strong>{totalAdmins}</strong>
			</article>
			<article>
				<p>Banned</p>
				<strong>{totalBanned}</strong>
			</article>
			<article>
				<p>Unverified</p>
				<strong>{totalUnverified}</strong>
			</article>
			<article>
				<p>Disabled keys</p>
				<strong>{totalDisabledKeys}</strong>
			</article>
		</section>

		{#if form?.actionMessage}
			<p class="notice">{form.actionMessage}</p>
		{/if}

		<section class="workspace-grid">
			<section class="users-pane" aria-label="User selection and filters">
				<section class="toolbar" aria-label="Filters">
					<label class="search-wrap">
						<span>Search user, name, or email</span>
						<input
							type="search"
							placeholder="Try user id or email"
							bind:value={query}
						/>
					</label>

					<div class="chips" role="tablist" aria-label="User filters">
						<button type="button" class:active={filterMode === 'all'} onclick={() => (filterMode = 'all')}>
							All
						</button>
						<button type="button" class:active={filterMode === 'admin'} onclick={() => (filterMode = 'admin')}>
							Admins
						</button>
						<button type="button" class:active={filterMode === 'banned'} onclick={() => (filterMode = 'banned')}>
							Banned
						</button>
						<button
							type="button"
							class:active={filterMode === 'unverified'}
							onclick={() => (filterMode = 'unverified')}
						>
							Unverified
						</button>
						<button type="button" class:active={filterMode === 'no-key'} onclick={() => (filterMode = 'no-key')}>
							No key
						</button>
					</div>
				</section>

				<section class="user-list" aria-label="Users">
					{#if filteredUsers.length === 0}
						<p class="empty">No users match current filters.</p>
					{:else}
						{#each filteredUsers as row (row.userId)}
							<button
								type="button"
								class={`user-row ${row.userId === data.selectedUserId ? 'active' : ''}`}
								onclick={() => goto(resolve(`/admin?user_id=${encodeURIComponent(row.userId)}`))}
							>
								<span class="user-topline">
									<span class="mono">{row.userId}</span>
									<span class="key-pill">{getApiKeyState(row.apiKeyAssigned, row.apiKeyDisabled)}</span>
								</span>
								<span class="user-email">{data.emailByUserId[row.userId] ? (data.emailByUserId[row.userId]?.split('@')[0].slice(0, 3)+"****@"+data.emailByUserId[row.userId]?.split('@')[1]) : 'No Email'}</span>
								<span class="user-name">{row.preferredName ?? 'Unspecified'}</span>
								<span class="flag-list">
									<span class="flag">{row.userState}</span>
									{#if row.isAdmin && row.userState !== 'admin'}
										<span class="flag flag-admin">Admin</span>
									{/if}
									{#if row.banned && row.userState !== 'banned'}
										<span class="flag flag-ban">Banned</span>
									{/if}
								</span>
							</button>
						{/each}
					{/if}
				</section>
			</section>

			<section class="details-pane" aria-label="Selected user details">
				{#if selectedRow && data.selectedUser}
					<article class="detail-card user-card">
						<h2>Selected user</h2>
						<p class="mono">{selectedRow.userId}</p>
						<p>{data.emailByUserId[selectedRow.userId] ? (data.emailByUserId[selectedRow.userId]?.split('@')[0].slice(0, 3)+"****@"+data.emailByUserId[selectedRow.userId]?.split('@')[1]) : 'No Email'}</p>
						<p>API key: <strong>{apiKeyStateLabel}</strong></p>
						<p>User state: <strong>{selectedRow.userState}</strong></p>
						<div class="flag-list">
							{#if selectedRow.isAdmin}
								<span class="flag flag-admin">Admin</span>
							{/if}
							{#if selectedRow.banned}
								<span class="flag flag-ban">Banned</span>
							{/if}
						</div>
					</article>

					<div class="detail-grid">
						<article class="detail-card action-card">
							<h2>Usage</h2>
							<p>Allowed: ${data.selectedUser.allowedUsageUsd.toFixed(4)}</p>
							<p>Current usage: ${data.selectedUser.currentUsageUsd.toFixed(4)}</p>
							<p class={`usage-${getUsageTone(remainingCredits)}`}>Remaining: ${remainingCredits.toFixed(4)}</p>
							<form method="POST" action="?/setUsageLimit" use:enhance={enhanceAdminAction}>
								<input type="hidden" name="userId" value={selectedRow.userId} />
								<label class="search-wrap">
									<span>Set allowed usage (USD)</span>
									<input
										type="number"
										name="allowedUsageUsd"
										min="0"
										step="0.01"
										value={data.selectedUser.allowedUsageUsd.toFixed(4)}
									/>
								</label>
								<button type="submit" class="small-button">Save limit</button>
							</form>
							<form method="POST" action="?/refreshUsage" use:enhance={enhanceAdminAction}>
								<input type="hidden" name="userId" value={selectedRow.userId} />
								<button type="submit" class="small-button">Refresh usage</button>
							</form>
						</article>

						<article class="detail-card action-card">
							<h2>API key controls</h2>
							<form method="POST" action="?/rollApiKey" use:enhance={enhanceAdminAction}>
								<input type="hidden" name="userId" value={selectedRow.userId} />
								<button type="submit">Roll API key</button>
							</form>

							<form method="POST" action="?/setApiKeyDisabled" use:enhance={enhanceAdminAction}>
								<input type="hidden" name="userId" value={selectedRow.userId} />
								<input type="hidden" name="disabled" value={selectedRow.apiKeyDisabled ? 'false' : 'true'} />
								<button type="submit" class="outline">
									{selectedRow.apiKeyDisabled ? 'Enable API key' : 'Disable API key'}
								</button>
							</form>
						</article>

						<article class="detail-card action-card">
							<h2>Providers</h2>
							{#if data.selectedProviders.length === 0}
								<p>No linked providers.</p>
							{:else}
								<ul class="provider-list">
									{#each data.selectedProviders as provider (provider)}
										<li>
											<span>{provider}</span>
											<form method="POST" action="?/revokeProvider" use:enhance={enhanceAdminAction}>
												<input type="hidden" name="userId" value={selectedRow.userId} />
												<input type="hidden" name="provider" value={provider} />
												<button type="submit" class="danger">Revoke</button>
											</form>
										</li>
									{/each}
								</ul>
							{/if}
						</article>

						<article class="detail-card action-card">
							<h2>User state</h2>
							<form method="POST" action="?/setUserState" use:enhance={enhanceAdminAction}>
								<input type="hidden" name="userId" value={selectedRow.userId} />
								<label class="search-wrap">
									<span>Set state</span>
									<select name="userState">
										<option value="unverified" selected={selectedRow.userState === 'unverified'}>unverified</option>
										<option value="verified" selected={selectedRow.userState === 'verified'}>verified</option>
										<option value="admin" selected={selectedRow.userState === 'admin'}>admin</option>
										<option value="banned" selected={selectedRow.userState === 'banned'}>banned</option>
									</select>
								</label>
								<button type="submit">Save state</button>
							</form>

							<form method="POST" action="?/deleteAccount" use:enhance={enhanceAdminAction}>
								<input type="hidden" name="userId" value={selectedRow.userId} />
								<button type="submit" class="danger">Delete account</button>
							</form>
						</article>
					</div>
				{:else}
					<article class="detail-card empty-detail">
						<h2>No user selected</h2>
						<p>Select a user from the left to load account controls.</p>
					</article>
				{/if}
			</section>
		</section>
	</section>
</main>

<style>
	:root {
		--bg-0: #0f1115;
		--panel: #1a1d23;
		--panel-border: #2b3038;
		--muted: #cbd5e1;
		--text: #e5e7eb;
		--accent: #e5e7eb;
		--warm: #f5b76a;
		--danger: #fecaca;
		--mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
		--sans: 'Segoe UI', sans-serif;
	}

	:global(body) {
		margin: 0;
		color: var(--text);
		font-family: var(--sans);
		background: var(--bg-0);
	}

	.page {
		min-height: 100vh;
		box-sizing: border-box;
		width: min(1180px, 100%);
		padding: 2rem;
		margin-inline: auto;
	}

	.toast {
		position: fixed;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 30;
		padding: 0.72rem 1rem;
		border-radius: 0.6rem;
		background: #183326;
		border: 1px solid #2f5d46;
		color: #d7ffe6;
		font-weight: 700;
		box-shadow: 0 6px 20px #000;
	}

	.panel {
		width: 100%;
		padding: 1.25rem;
		border-radius: 1.1rem;
		border: 1px solid var(--panel-border);
		background: var(--panel);
	}

	.shell-grid {
		display: grid;
		gap: 1.15rem;
	}

	.hero {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.35rem;
		border-bottom: 1px solid #2b3038;
	}

	.hero-copy {
		display: grid;
		gap: 0.25rem;
	}

	.hero-actions {
		display: flex;
		align-items: center;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.2em;
		font-size: 1.5rem;
		color: #f5b76a;
		margin: 0;
	}

	h1 {
		margin: 0.5rem 0;
		font-size: clamp(1.8rem, 4vw, 2.8rem);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	h2 {
		margin: 0 0 0.5rem;
	}

	.lede {
		margin: 0;
		color: var(--muted);
		line-height: 1.6;
		max-width: 58ch;
	}

	.metric-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.7rem;
	}

	.metric-grid article {
		padding: 0.95rem;
		border-radius: 0.8rem;
		background: #15181e;
		border: 1px solid #2b3038;
	}

	.metric-grid p {
		margin: 0;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.metric-grid strong {
		display: block;
		margin-top: 0.35rem;
		font-size: 1.5rem;
		letter-spacing: -0.02em;
	}

	.workspace-grid {
		display: grid;
		grid-template-columns: minmax(340px, 0.95fr) minmax(0, 1.45fr);
		gap: 1rem;
		align-items: start;
	}

	.users-pane,
	.details-pane {
		display: grid;
		gap: 0.9rem;
		align-self: start;
	}

	.details-pane {
		align-content: start;
	}

	.user-list {
		display: grid;
		gap: 0.55rem;
		max-height: 64vh;
		overflow: auto;
		padding-right: 0.25rem;
	}

	.toolbar {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.9rem;
		align-items: end;
		padding: 1rem;
		border-radius: 0.75rem;
		border: 1px solid #2b3038;
		background: #15181e;
	}

	.search-wrap {
		display: grid;
		gap: 0.4rem;
		font-size: 0.86rem;
		color: var(--muted);
	}

	input[type='search'] {
		padding: 0.68rem 0.82rem;
		border-radius: 0.6rem;
		border: 1px solid #3b4250;
		background: #15181e;
		color: var(--text);
		font: inherit;
	}

	input[type='search']:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	input[type='number'],
	select {
		padding: 0.68rem 0.82rem;
		border-radius: 0.6rem;
		border: 1px solid #3b4250;
		background: #15181e;
		color: var(--text);
		font: inherit;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.chips button {
		padding: 0.5rem 0.72rem;
		border-radius: 999px;
		border: 1px solid #3b4250;
		background: #15181e;
		color: var(--muted);
		font-size: 0.84rem;
		font-weight: 700;
	}

	.chips button.active {
		color: #02131d;
		background: #f5b76a;
		border-color: #f5b76a;
	}

	.notice {
		margin: 0;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: #2f2414;
		border: 1px solid #5d4721;
		color: #ffe8bf;
	}

	.user-row {
		display: grid;
		gap: 0.35rem;
		width: 100%;
		max-width: 100%;
		padding: 0.82rem;
		border-radius: 0.75rem;
		border: 1px solid #313743;
		background: #15181e;
		color: var(--text);
		text-align: left;
		overflow: hidden;
	}

	.user-row:hover {
		background: #1f2530;
	}

	.user-row.active {
		background: #222a36;
		border-color: #5a6c87;
	}

	.user-topline {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.user-email {
		font-size: 0.9rem;
		color: #cdd6e5;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user-name {
		font-size: 0.84rem;
		color: #9ca3af;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty {
		text-align: center;
		color: var(--muted);
	}

	.mono {
		font-family: var(--mono);
		font-size: 0.85rem;
		letter-spacing: -0.01em;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.flag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.flag,
	.key-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.2rem 0.5rem;
		font-size: 0.74rem;
		font-weight: 700;
		border-radius: 999px;
		background: #2a2f38;
		border: 1px solid #3b4250;
		color: #d4e5ff;
	}

	.flag-admin {
		background: #2c2f36;
		border-color: #4c5567;
		color: #e5e7eb;
	}

	.flag-ban {
		background: #3b1212;
		border-color: #7f1d1d;
		color: #ffd0cf;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		align-items: start;
	}

	.detail-card {
		padding: 1rem;
		border-radius: 0.75rem;
		border: 1px solid #2b3038;
		background: #1a1d23;
		height: fit-content;
		align-self: start;
	}

	.user-card {
		display: grid;
		gap: 0.15rem;
	}

	.empty-detail {
		min-height: 180px;
		align-content: center;
		justify-items: start;
	}

	.detail-card p {
		margin: 0.3rem 0;
		color: var(--muted);
	}

	.action-card {
		display: grid;
		gap: 0.6rem;
	}

	.action-card form {
		display: grid;
		gap: 0.45rem;
	}

	.provider-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}

	.provider-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		padding: 0.35rem 0;
		border-bottom: 1px dashed #3b4250;
	}

	.provider-list li > span {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.provider-list li:last-child {
		border-bottom: 0;
	}

	button,
	.ghost-link,
	.small-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: fit-content;
		max-width: 100%;
		border-radius: 0.5rem;
		padding: 0.6rem 0.9rem;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		border: 1px solid transparent;
		background: #e5e7eb;
		color: #111827;
		text-decoration: none;
		transition: 120ms ease;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.action-card button,
	.provider-list button {
		width: 100%;
	}

	button:hover,
	.ghost-link:hover,
	.small-button:hover {
		transform: translateY(-2px);
		/* background: #f3f4f6; */
	}

	.small-button {
		padding: 0.45rem 0.7rem;
		font-size: 0.85rem;
	}

	.ghost-link {
		background: transparent;
		color: #f5b76a;
		border-color: #f5b76a;
	}

	button.outline {
		background: transparent;
		border-color: var(--warm);
		color: var(--warm);
	}

	button.danger {
		background: #3b1212;
		border-color: #7f1d1d;
		color: #fecaca;
	}

	.usage-ok {
		color: #b6f7db;
	}

	.usage-warn {
		color: #ffe2ad;
	}

	.usage-danger {
		color: #ffc0bf;
	}

	@media (max-width: 900px) {
		.metric-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.workspace-grid {
			grid-template-columns: 1fr;
		}

		.detail-grid {
			grid-template-columns: 1fr;
		}

		.user-list {
			max-height: 40vh;
		}

		.hero {
			flex-direction: column;
			align-items: flex-start;
		}
	}

	@media (max-width: 560px) {
		.page {
			padding: 0.85rem;
		}

		.panel {
			padding: 0.9rem;
		}

		.metric-grid {
			grid-template-columns: 1fr;
		}

		.user-row {
			padding: 0.72rem;
		}
	}
	input {
		outline: none !important;
	}
</style>
