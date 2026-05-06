<script lang="ts">
	let confirmData = $state('');
	let confirmKeys = $state('');
	let dataBusy = $state(false);
	let keysBusy = $state(false);
	let dataMsg = $state('');
	let keysMsg = $state('');

	async function clearData(): Promise<void> {
		if (confirmData !== 'clear my data') return;
		dataBusy = true;
		dataMsg = '';
		try {
			const res = await fetch('/api/data/clear', { method: 'DELETE' });
			dataMsg = res.ok ? 'Session data cleared.' : 'Failed to clear data.';
			confirmData = '';
		} catch {
			dataMsg = 'Request failed.';
		} finally {
			dataBusy = false;
		}
	}

	async function clearKeys(): Promise<void> {
		if (confirmKeys !== 'remove all keys') return;
		keysBusy = true;
		keysMsg = '';
		try {
			const res = await fetch('/api/keys/clear', { method: 'DELETE' });
			keysMsg = res.ok ? 'All API keys removed.' : 'Failed to remove keys.';
			confirmKeys = '';
		} catch {
			keysMsg = 'Request failed.';
		} finally {
			keysBusy = false;
		}
	}
</script>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
	<header class="flex items-baseline justify-between">
		<h1 class="text-2xl font-semibold text-text-primary">Data &amp; Keys</h1>
		<a href="/settings" class="text-sm text-text-muted hover:text-text-primary">← Settings</a>
	</header>

	<section class="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
		<header>
			<h2 class="text-base font-medium text-text-primary">Clear session data</h2>
			<p class="text-sm text-text-secondary">
				Deletes all sessions, answers, and debriefs. Bundles and repo data are kept.
			</p>
		</header>
		<label for="confirm-data" class="text-sm text-text-muted">
			Type <strong>clear my data</strong> to confirm:
		</label>
		<input
			id="confirm-data"
			type="text"
			bind:value={confirmData}
			placeholder="clear my data"
			class="rounded-md border border-border bg-surface-0 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted"
		/>
		<button
			type="button"
			onclick={clearData}
			disabled={confirmData !== 'clear my data' || dataBusy}
			class="self-start rounded-md border border-state-error/40 bg-state-error-bg px-3 py-1.5 text-sm text-state-error hover:bg-state-error/20 disabled:opacity-50"
		>
			{dataBusy ? 'Clearing…' : 'Clear session data'}
		</button>
		{#if dataMsg}
			<p class="text-sm text-text-secondary">{dataMsg}</p>
		{/if}
	</section>

	<section class="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
		<header>
			<h2 class="text-base font-medium text-text-primary">Remove all API keys</h2>
			<p class="text-sm text-text-secondary">
				Removes stored LLM tokens and GitHub PAT from the OS keychain or fallback store.
			</p>
		</header>
		<label for="confirm-keys" class="text-sm text-text-muted">
			Type <strong>remove all keys</strong> to confirm:
		</label>
		<input
			id="confirm-keys"
			type="text"
			bind:value={confirmKeys}
			placeholder="remove all keys"
			class="rounded-md border border-border bg-surface-0 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted"
		/>
		<button
			type="button"
			onclick={clearKeys}
			disabled={confirmKeys !== 'remove all keys' || keysBusy}
			class="self-start rounded-md border border-state-error/40 bg-state-error-bg px-3 py-1.5 text-sm text-state-error hover:bg-state-error/20 disabled:opacity-50"
		>
			{keysBusy ? 'Removing…' : 'Remove all API keys'}
		</button>
		{#if keysMsg}
			<p class="text-sm text-text-secondary">{keysMsg}</p>
		{/if}
	</section>
</main>
