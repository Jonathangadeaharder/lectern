<script lang="ts">
	import { onMount } from 'svelte';
	import { emit } from '$lib/client/sound/events';

	let { data } = $props();

	interface SelfConfidence {
		questionId: string;
		chunkTitle: string;
		selfConfidence: number;
		computedScore: number;
	}

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
		selfConfidence?: SelfConfidence[];
		rawSession?: any;
	}

	let debrief = $state<Debrief | null>(null);
	let loading = $state(true);

	onMount(async () => {
		emit('session_debrief');
		try {
			const res = await fetch(`/api/sessions/${data.sessionId}/debrief`);
			if (res.ok) debrief = await res.json();
		} finally {
			loading = false;
		}
	});

	function exportJson(): void {
		if (!debrief?.rawSession) return;
		const blob = new Blob([JSON.stringify(debrief.rawSession, null, 2)], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `session-${data.sessionId}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

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

	const maxScatterSelf = $derived(
		Math.max(5, ...(debrief?.selfConfidence?.map((c) => c.selfConfidence) ?? [5]))
	);
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
	<header class="flex items-baseline justify-between">
		<h1 class="text-2xl font-semibold text-text-primary">Debrief</h1>
		<div class="flex gap-3">
			<button
				type="button"
				onclick={exportJson}
				disabled={!debrief?.rawSession}
				class="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-2 disabled:opacity-50"
			>
				Export JSON
			</button>
			<a href="/" class="text-sm text-text-muted hover:text-text-primary">Home</a>
		</div>
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

		{#if debrief.selfConfidence?.length}
			<section class="flex flex-col gap-2">
				<h2 class="text-base font-medium text-text-primary">Self vs. computed calibration</h2>
				<div class="relative rounded-md border border-border bg-surface-1 p-4" style:height="200px">
					<div class="absolute inset-4">
						<svg viewBox="0 0 100 100" class="h-full w-full" preserveAspectRatio="xMidYMid meet">
							<line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" class="text-border-subtle" stroke-dasharray="4 2" />
							{#each debrief.selfConfidence as pt (pt.questionId)}
								{@const x = (pt.selfConfidence / maxScatterSelf) * 100}
								{@const y = (1 - pt.computedScore) * 100}
								<circle
									cx={x}
									cy={y}
									r="3"
									class={pt.computedScore >= 0.7 ? 'fill-state-success' : pt.computedScore >= 0.4 ? 'fill-state-warning' : 'fill-state-error'}
								/>
								<title>{pt.chunkTitle}: self={pt.selfConfidence} score={pt.computedScore.toFixed(2)}</title>
							{/each}
						</svg>
					</div>
					<div class="absolute bottom-1 left-4 text-xs text-text-muted">Self-confidence →</div>
					<div class="absolute top-1 left-1 text-xs text-text-muted" style="writing-mode: vertical-lr; transform: rotate(180deg)">Computed score →</div>
				</div>
				<p class="text-xs text-text-muted">Points above the diagonal = overconfident. Below = underconfident.</p>
			</section>
		{/if}
	{/if}
</main>
