<script lang="ts">
	import { onMount } from 'svelte';

	let { data } = $props();

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
		try {
			const res = await fetch(`/api/sessions/${data.sessionId}/debrief`);
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

	const scoreDistribution = $derived.by(() => {
		if (!debrief) return { high: 0, medium: 0, low: 0 };
		let high = 0;
		let medium = 0;
		let low = 0;
		for (const c of debrief.perChunk) {
			if (c.score >= 0.8) high++;
			else if (c.score >= 0.5) medium++;
			else low++;
		}
		return { high, medium, low };
	});
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
			<h2 class="text-base font-medium text-text-primary">Confidence calibration</h2>
			<div class="rounded-md border border-border bg-surface-1 p-4">
				<div class="mb-3 flex items-end gap-1" style:height="80px">
					{#each debrief.perChunk as c (c.chunkId)}
						<div
							class="flex-1 rounded-t-sm transition-all
								{c.score >= 0.8 ? 'bg-state-success' : c.score >= 0.5 ? 'bg-state-warning' : 'bg-state-error'}"
							style:height="{Math.max(4, c.score * 100)}%"
							title="{c.title}: {(c.score * 100).toFixed(0)}%"
						></div>
					{/each}
				</div>
				<div class="flex justify-between text-xs text-text-muted">
					<span>Chunks</span>
					<span>Score %</span>
				</div>
				<div class="mt-3 flex gap-4 text-sm">
					<span class="flex items-center gap-1">
						<span class="inline-block h-2 w-2 rounded-full bg-state-success"></span>
						High ({scoreDistribution.high})
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-2 w-2 rounded-full bg-state-warning"></span>
						Medium ({scoreDistribution.medium})
					</span>
					<span class="flex items-center gap-1">
						<span class="inline-block h-2 w-2 rounded-full bg-state-error"></span>
						Low ({scoreDistribution.low})
					</span>
				</div>
			</div>
		</section>

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
