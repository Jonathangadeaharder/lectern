<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	interface Debrief {
		sessionId: string;
		confidenceScore: number;
		band: 'high' | 'medium' | 'low';
		recommendation: string;
		perChunk: Array<{
			chunkId: string;
			title: string;
			score: number;
			answered: number;
			total: number;
			note: string;
		}>;
		missedByTag: Array<{ tag: string; missCount: number; exampleQuestionIds: string[] }>;
		followUps: string[];
	}

	let debrief = $state<Debrief | null>(null);
	let loading = $state(true);

	onMount(async () => {
		const id = $page.params.id;
		try {
			const res = await fetch(`/api/sessions/${id}/debrief`);
			if (res.ok) debrief = await res.json();
		} finally {
			loading = false;
		}
	});

	const bandLabel = $derived(
		debrief?.band === 'high'
			? 'High confidence'
			: debrief?.band === 'medium'
				? 'Medium confidence'
				: debrief
					? 'Low confidence'
					: ''
	);

	const bandClass = $derived(
		debrief?.band === 'high'
			? 'text-state-success'
			: debrief?.band === 'medium'
				? 'text-state-warning'
				: 'text-state-error'
	);
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
	<header class="flex items-baseline justify-between">
		<h1 class="text-2xl font-semibold text-text-primary">Debrief</h1>
		<a href="/" class="text-sm text-text-muted hover:text-text-primary">Home</a>
	</header>

	{#if loading}
		<p class="text-text-muted">Loading…</p>
	{:else if !debrief}
		<p class="text-text-muted">No debrief available.</p>
	{:else}
		<section class="rounded-md border border-border bg-surface-1 p-6">
			<div class="text-7xl font-light tabular-nums text-text-primary">
				{debrief.confidenceScore}
			</div>
			<p class="mt-2 text-sm uppercase tracking-wide {bandClass}">{bandLabel}</p>
			<p class="mt-3 text-text-secondary">{debrief.recommendation}</p>
		</section>

		<section class="flex flex-col gap-2">
			<h2 class="text-base font-medium text-text-primary">Per-chunk breakdown</h2>
			<ul class="flex flex-col divide-y divide-border-subtle rounded-md border border-border bg-surface-1">
				{#each debrief.perChunk as c (c.chunkId)}
					<li class="flex items-baseline justify-between p-3">
						<div>
							<p class="text-sm text-text-primary">{c.title}</p>
							<p class="text-xs text-text-muted">{c.note}</p>
						</div>
						<span class="font-mono text-sm tabular-nums text-text-secondary"
							>{(c.score * 100).toFixed(0)}</span
						>
					</li>
				{/each}
			</ul>
		</section>

		{#if debrief.missedByTag.length}
			<section class="flex flex-col gap-2">
				<h2 class="text-base font-medium text-text-primary">What you missed</h2>
				<ul class="flex flex-col gap-1 rounded-md border border-border bg-surface-1 p-3">
					{#each debrief.missedByTag as m (m.tag)}
						<li class="flex justify-between text-sm">
							<span class="font-mono text-text-secondary">{m.tag}</span>
							<span class="text-text-muted">{m.missCount} miss{m.missCount === 1 ? '' : 'es'}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="flex flex-col gap-2">
			<h2 class="text-base font-medium text-text-primary">Suggested follow-ups</h2>
			<ul class="flex flex-col gap-1 rounded-md border border-border bg-surface-1 p-3 text-sm text-text-secondary">
				{#each debrief.followUps as f (f)}
					<li>• {f}</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
