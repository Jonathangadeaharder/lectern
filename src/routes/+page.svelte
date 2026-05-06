<script lang="ts">
	import { onMount } from 'svelte';

	let configured = $state(false);
	let loading = $state(true);

	onMount(async () => {
		try {
			const res = await fetch('/api/settings/llm/quick');
			if (res.ok) {
				const body = await res.json();
				configured = Boolean(body.endpoint && body.model && body.hasToken);
			}
		} finally {
			loading = false;
		}
	});
</script>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
	<header class="flex flex-col gap-1">
		<h1 class="text-3xl font-semibold text-text-primary">Lectern</h1>
		<p class="text-text-secondary">
			A guided reading companion for code review.
		</p>
	</header>

	{#if loading}
		<p class="text-text-muted">Loading…</p>
	{:else if !configured}
		<section class="rounded-md border border-border bg-surface-1 p-6">
			<h2 class="mb-2 text-lg font-medium text-text-primary">Set up your LLM</h2>
			<p class="mb-4 text-text-secondary">
				Lectern needs an LLM endpoint. Pick a provider, paste a token, you're done.
			</p>
			<a
				href="/onboarding"
				class="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface-0 transition hover:bg-accent-hover"
			>
				Continue to setup →
			</a>
		</section>
		{:else}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-medium text-text-primary">Start a review</h2>
			<form method="POST" action="/api/sessions/create" class="flex gap-2">
				<input
					type="text"
					name="url"
					placeholder="https://github.com/owner/repo/pull/123"
					class="flex-1 rounded-md border border-border bg-surface-1 px-3 py-2 text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
				/>
				<button
					type="submit"
					class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface-0 hover:bg-accent-hover"
				>
					Ingest
				</button>
			</form>
			<div class="mt-4 flex gap-4">
				<a class="text-sm text-text-muted hover:text-text-primary" href="/settings/keys">
					Settings →
				</a>
				<a class="text-sm text-text-muted hover:text-text-primary" href="/dashboard">
					Dashboard →
				</a>
			</div>
		</section>
	{/if}
</main>
