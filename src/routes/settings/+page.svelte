<script lang="ts">
	import { onMount } from 'svelte';
	import { getTheme, toggleTheme } from '$lib/client/theme.svelte';

	interface Status {
		endpoint: string | null;
		model: string | null;
		hasToken: boolean;
	}

	let status = $state<Status | null>(null);
	let loading = $state(true);

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
</script>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
	<header class="flex items-baseline justify-between">
		<h1 class="text-2xl font-semibold text-text-primary">Settings</h1>
		<a href="/" class="text-sm text-text-muted hover:text-text-primary">← Home</a>
	</header>

	<section class="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
		<header>
			<h2 class="text-base font-medium text-text-primary">Appearance</h2>
			<p class="text-sm text-text-secondary">Toggle between dark and light themes.</p>
		</header>
		<button
			type="button"
			onclick={toggleTheme}
			class="self-start rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
		>
			Switch to {getTheme() === 'dark' ? 'light' : 'dark'} mode
		</button>
	</section>

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
			<h2 class="text-base font-medium text-text-primary">Data &amp; Keys</h2>
			<p class="text-sm text-text-secondary">Clear session data or remove stored API keys.</p>
		</header>
		<a
			href="/settings/data"
			class="self-start rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
		>
			Manage
		</a>
	</section>
</main>
