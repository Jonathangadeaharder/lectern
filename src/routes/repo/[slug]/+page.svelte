<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const p = $derived(data.profile);

	const levelColors: Record<string, string> = {
		novice: 'text-text-muted',
		developing: 'text-state-warning',
		proficient: 'text-state-info',
		mastered: 'text-state-success'
	};

	function scorePercent(score: number | null): string {
		if (score === null) return '—';
		return `${Math.round(score * 100)}%`;
	}
</script>

<main class="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
	<header class="flex items-baseline justify-between">
		<div>
			<h1 class="text-2xl font-semibold text-text-primary">{p.repoSlug}</h1>
			<p class="text-sm text-text-secondary">Repository competence profile.</p>
		</div>
		<a href="/dashboard" class="text-sm text-text-muted hover:text-text-primary">← Dashboard</a>
	</header>

	{#if p.competence}
		<section class="grid grid-cols-3 gap-4">
			<div class="rounded-md border border-border bg-surface-1 p-4">
				<p class="text-xs text-text-muted">Sessions</p>
				<p class="text-2xl font-semibold text-text-primary">{p.competence.totalSessions}</p>
			</div>
			<div class="rounded-md border border-border bg-surface-1 p-4">
				<p class="text-xs text-text-muted">Questions</p>
				<p class="text-2xl font-semibold text-text-primary">{p.competence.totalQuestions}</p>
			</div>
			<div class="rounded-md border border-border bg-surface-1 p-4">
				<p class="text-xs text-text-muted">Avg score</p>
				<p class="text-2xl font-semibold text-text-primary">
					{scorePercent(p.competence.avgScore)}
				</p>
			</div>
		</section>
	{:else}
		<p class="text-sm text-text-muted">No sessions for this repo yet.</p>
	{/if}

	{#if p.skills.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-medium text-text-primary">Skill mastery</h2>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{#each p.skills as skill}
					<div class="rounded-md border border-border bg-surface-1 p-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium text-text-primary">{skill.tag}</span>
							<span class="text-xs {levelColors[skill.level]}">{skill.level}</span>
						</div>
						<div class="mt-2 h-1.5 w-full rounded-full bg-surface-3">
							<div
								class="h-full rounded-full bg-accent transition-all"
								style="width: {Math.round(skill.ewmaScore * 100)}%"
							></div>
						</div>
						<p class="mt-1 text-xs text-text-muted">
							{skill.totalAttempts} attempts · {Math.round(skill.passRate * 100)}% pass
						</p>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if p.weakSpots.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-medium text-text-primary">Weak spots</h2>
			<div class="flex flex-col gap-2">
				{#each p.weakSpots as ws}
					<div class="flex items-center justify-between rounded-md border border-border bg-surface-1 px-4 py-3">
						<span class="text-sm text-text-primary">{ws.tag}</span>
						<span class="text-sm text-state-warning">
							{Math.round(ws.missRate * 100)}% miss ({ws.sampleCount} samples)
						</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if p.bugPatterns.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-medium text-text-primary">Bug patterns</h2>
			<div class="flex flex-col gap-2">
				{#each p.bugPatterns as bp}
					<div class="rounded-md border border-border bg-surface-1 p-4">
						<p class="text-sm font-medium text-text-primary">{bp.summary}</p>
						{#if bp.rootCause}
							<p class="text-xs text-text-secondary">Root cause: {bp.rootCause}</p>
						{/if}
						<p class="text-xs text-text-muted">
							Seen {bp.frequency}× · confidence {Math.round(bp.confidence * 100)}%
						</p>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if p.conventions.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-medium text-text-primary">Conventions</h2>
			<div class="flex flex-col gap-2">
				{#each p.conventions as conv}
					<div class="rounded-md border border-border bg-surface-1 p-4">
						<p class="text-sm font-medium text-text-primary">{conv.source}: {conv.filePath}</p>
						{#if conv.summary}
							<p class="text-xs text-text-secondary">{conv.summary}</p>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if p.recentActivity.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-medium text-text-primary">Recent activity</h2>
			<div class="flex flex-col gap-1">
				{#each p.recentActivity as act}
					<div class="flex items-center justify-between rounded-sm px-2 py-1 text-xs">
						<span class="text-text-muted">{act.date}</span>
						<span class="text-text-secondary">
							{act.questionsPassed}/{act.questionsAttempted} passed
						</span>
						<span class="text-text-primary">{scorePercent(act.avgScore)}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</main>
