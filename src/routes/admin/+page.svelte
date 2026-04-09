<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | undefined } = $props();

	type FilterMode = 'all' | 'admin' | 'banned' | 'unverified' | 'no-key';

	let query = $state('');
	let filterMode = $state<FilterMode>('all');

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
</script>

<svelte:head>
	<title>Admin Dashboard - Nawab Auth</title>
</svelte:head>

<main class="page">
	<section class="panel shell-grid">
		<header class="hero">
			<div>
				<p class="eyebrow">Admin dashboard</p>
				<h1>User operations</h1>
				<p class="lede">
					Search, triage, and act on accounts from one operational cockpit.
				</p>
			</div>
			<form method="GET" action="/dashboard">
				<button type="submit" class="ghost-link">Back to dashboard</button>
			</form>
		</header>

		<section class="metric-grid" aria-label="Admin metrics">
			<article>
				<p>Total users</p>
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
				<button
					type="button"
					class:active={filterMode === 'all'}
					onclick={() => (filterMode = 'all')}
				>
					All
				</button>
				<button
					type="button"
					class:active={filterMode === 'admin'}
					onclick={() => (filterMode = 'admin')}
				>
					Admins
				</button>
				<button
					type="button"
					class:active={filterMode === 'banned'}
					onclick={() => (filterMode = 'banned')}
				>
					Banned
				</button>
				<button
					type="button"
					class:active={filterMode === 'unverified'}
					onclick={() => (filterMode = 'unverified')}
				>
					Unverified
				</button>
				<button
					type="button"
					class:active={filterMode === 'no-key'}
					onclick={() => (filterMode = 'no-key')}
				>
					No key
				</button>
			</div>
		</section>

		{#if form?.actionMessage}
			<p class="notice">{form.actionMessage}</p>
		{/if}

		<section class="table-card" aria-label="User table">
			<table>
				<thead>
					<tr>
						<th>User</th>
						<th>Email</th>
						<th>Name</th>
						<th>Flags</th>
						<th>API key</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#if filteredUsers.length === 0}
						<tr>
							<td colspan="6" class="empty">No users match current filters.</td>
						</tr>
					{:else}
						{#each filteredUsers as row (row.userId)}
							<tr class:selected={row.userId === data.selectedUserId}>
								<td class="mono">{row.userId}</td>
								<td>{data.emailByUserId[row.userId] ?? 'No email'}</td>
								<td>{row.preferredName ?? 'Unspecified'}</td>
								<td>
									<div class="flag-list">
										<span class="flag">{row.userState}</span>
										{#if row.isAdmin}
											<span class="flag flag-admin">Admin</span>
										{/if}
										{#if row.banned}
											<span class="flag flag-ban">Banned</span>
										{/if}
										{#if row.userState === 'unverified'}
											<span class="flag">Needs verify</span>
										{:else if !row.isAdmin && !row.banned}
											<span class="flag">Standard</span>
										{/if}
									</div>
								</td>
								<td><span class="key-pill">{getApiKeyState(row.apiKeyAssigned, row.apiKeyDisabled)}</span></td>
								<td>
									<form method="GET" action="/admin">
										<input type="hidden" name="user_id" value={row.userId} />
										<button type="submit" class="small-button">Open</button>
									</form>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</section>

		{#if selectedRow && data.selectedUser}
			<section class="detail-grid">
				<article class="detail-card user-card">
					<h2>Selected user</h2>
					<p class="mono">{selectedRow.userId}</p>
					<p>{selectedEmail ?? 'No email available'}</p>
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

				<article class="detail-card">
					<h2>Usage</h2>
					<p>Allowed: ${data.selectedUser.allowedUsageUsd.toFixed(2)}</p>
					<p>Current usage: ${data.selectedUser.currentUsageUsd.toFixed(2)}</p>
					<p class={`usage-${getUsageTone(remainingCredits)}`}>Remaining: ${remainingCredits.toFixed(2)}</p>
					<form method="POST" action="?/setUsageLimit">
						<input type="hidden" name="userId" value={selectedRow.userId} />
						<label class="search-wrap">
							<span>Set allowed usage (USD)</span>
							<input
								type="number"
								name="allowedUsageUsd"
								min="0"
								step="0.01"
								value={data.selectedUser.allowedUsageUsd.toFixed(2)}
							/>
						</label>
						<button type="submit" class="small-button">Save limit</button>
					</form>
					<form method="POST" action="?/refreshUsage">
						<input type="hidden" name="userId" value={selectedRow.userId} />
						<button type="submit" class="small-button">Refresh usage</button>
					</form>
				</article>

				<article class="detail-card action-card">
					<h2>API key controls</h2>
					<form method="POST" action="?/rollApiKey">
						<input type="hidden" name="userId" value={selectedRow.userId} />
						<button type="submit">Roll API key</button>
					</form>

					<form method="POST" action="?/setApiKeyDisabled">
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
									<form method="POST" action="?/revokeProvider">
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
					<form method="POST" action="?/setUserState">
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

					<form method="POST" action="?/deleteAccount">
						<input type="hidden" name="userId" value={selectedRow.userId} />
						<button type="submit" class="danger">Delete account</button>
					</form>
				</article>
			</section>
		{/if}
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

	.panel {
		width: 100%;
		padding: 1.25rem;
		border-radius: 1rem;
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
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.2em;
		font-size: 0.76rem;
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
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.7rem;
	}

	.metric-grid article {
		padding: 0.95rem;
		border-radius: 0.8rem;
		background: #1a1d23;
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
	}

	.toolbar {
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: 0.9rem;
		align-items: end;
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
		background: #15181e;
		border: 1px solid #2b3038;
		color: #cbd5e1;
	}

	.table-card {
		overflow-x: hidden;
		border-radius: 0.75rem;
		border: 1px solid #2b3038;
		background: #15181e;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}

	thead th {
		position: sticky;
		top: 0;
		background: #1a1d23;
		z-index: 1;
	}

	th,
	td {
		padding: 0.72rem;
		text-align: left;
		border-bottom: 1px solid #2b3038;
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	th:last-child,
	td:last-child {
		width: 6.2rem;
	}

	tbody tr.selected {
		background: #212631;
	}

	tbody tr:hover {
		background: #222732;
	}

	.empty {
		text-align: center;
		color: var(--muted);
	}

	.mono {
		font-family: var(--mono);
		font-size: 0.85rem;
		letter-spacing: -0.01em;
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
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}

	.detail-card {
		padding: 1rem;
		border-radius: 0.75rem;
		border: 1px solid #2b3038;
		background: #1a1d23;
	}

	.user-card {
		grid-column: span 2;
	}

	.detail-card p {
		margin: 0.3rem 0;
		color: var(--muted);
	}

	.action-card {
		display: grid;
		gap: 0.6rem;
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
	}

	button:hover,
	.ghost-link:hover,
	.small-button:hover {
		transform: translateY(-1px);
		background: #f3f4f6;
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

		.toolbar {
			grid-template-columns: 1fr;
		}

		.detail-grid {
			grid-template-columns: 1fr;
		}

		.user-card {
			grid-column: auto;
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

		table {
			font-size: 0.85rem;
		}

		.metric-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
