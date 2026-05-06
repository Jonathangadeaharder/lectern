<script lang="ts">
	import { onMount } from 'svelte';

	interface Status {
		endpoint: string | null;
		model: string | null;
		hasToken: boolean;
	}

	let status = $state<Status | null>(null);
	let loading = $state(true);
	let resetting = $state(false);
	let resetResult = $state<string | null>(null);

	onMount(async () => {
		await refresh();
	});

	async function refresh(): Promise<void> {
		loading = true;
		try {
			const res = await fetch('/api/settings/llm/quick');
			if (res.ok) status = await res.json();
		} finally {
			loading = false;
		}
	}

	async function resetAllMastery(): Promise<void> {
		resetting = true;
		resetResult = null;
		try {
			const res = await fetch('/api/mastery/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
			if (res.ok) {
				const data = await res.json();
				resetResult = `Reset ${data.reset} skill(s).`;
			} else {
				resetResult = 'Reset failed.';
			}
		} catch {
			resetResult = 'Reset failed.';
		} finally {
			resetting = false;
		}
	}
</script>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
	<header class="flex items-baseline justify-between">
		<h1 class="text-2xl font-semibold text-text-primary">Settings</h1>
		<a href="/" class="text-sm text-text-muted hover:text-text-primary">← Home</a>
	</header>

	<section class="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
		<header>
			<h2 class="text-base font-medium text-text-primary">LLM</h2>
			<p class="text-sm text-text-secondary">
				Single endpoint + model + token. Drives all generation and grading.
			</p>
		</header>

		{#if loading}
			<p class="text-text-muted">Loading…</p>
		{:else if !status?.endpoint || !status?.model}
			<p class="text-text-secondary">No LLM configured.</p>
			<a
				href="/onboarding"
				class="self-start rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface-0 hover:bg-accent-hover"
			>
				Set up
			</a>
		{:else}
			<dl class="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
				<dt class="text-text-secondary">Endpoint</dt>
				<dd class="font-mono text-text-primary">{status.endpoint}</dd>
				<dt class="text-text-secondary">Model</dt>
				<dd class="font-mono text-text-primary">{status.model}</dd>
				<dt class="text-text-secondary">Token</dt>
				<dd class="text-text-primary">
					{status.hasToken ? '●●●● set' : 'not set'}
				</dd>
			</dl>
			<div class="flex gap-2">
				<a
					href="/onboarding"
					class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
				>
					Replace
				</a>
			</div>
		{/if}
	</section>

	<section class="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
		<header>
			<h2 class="text-base font-medium text-text-primary">Sound</h2>
			<p class="text-sm text-text-secondary">Audio feedback during sessions.</p>
		</header>
		<a
			href="/settings/sound"
			class="self-start rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
		>
			Configure
		</a>
	</section>

	<section class="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
		<header>
			<h2 class="text-base font-medium text-text-primary">Mastery</h2>
			<p class="text-sm text-text-secondary">Reset all skill mastery scores to initial state.</p>
		</header>
		<button
			onclick={resetAllMastery}
			disabled={resetting}
			class="self-start rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
		>
			{resetting ? 'Resetting…' : 'Reset All Mastery'}
		</button>
		{#if resetResult}
			<p class="text-sm text-text-secondary">{resetResult}</p>
		{/if}
	</section>
</main>
