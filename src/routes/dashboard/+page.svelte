<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const d = $derived(data.dashboard);

	const levelColors: Record<string, string> = {
		novice: 'text-text-muted',
		developing: 'text-state-warning',
		proficient: 'text-state-info',
		mastered: 'text-state-success'
	};

	const levelBg: Record<string, string> = {
		novice: 'bg-surface-2',
		developing: 'bg-state-warning-bg',
		proficient: 'bg-state-info-bg',
		mastered: 'bg-state-success-bg'
	};

	function heatmapColor(count: number): string {
		if (count === 0) return 'bg-surface-2';
		if (count < 3) return 'bg-accent-muted';
		if (count < 6) return 'bg-accent/60';
		return 'bg-accent';
	}

	function scorePercent(score: number | null): string {
		if (score === null) return '—';
		return `${Math.round(score * 100)}%`;
	}
</script>

<main class="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
	<header class="flex items-baseline justify-between">
		<div>
			<h1 class="text-2xl font-semibold text-text-primary">Dashboard</h1>
			<p class="text-sm text-text-secondary">Your learning progress across sessions.</p>
		</div>
		<a href="/" class="text-sm text-text-muted hover:text-text-primary">← Home</a>
	</header>

	<section class="grid grid-cols-3 gap-4">
		<div class="rounded-md border border-border bg-surface-1 p-4">
			<p class="text-xs text-text-muted">Sessions</p>
			<p class="text-2xl font-semibold text-text-primary">{d.totalSessions}</p>
		</div>
		<div class="rounded-md border border-border bg-surface-1 p-4">
			<p class="text-xs text-text-muted">Questions answered</p>
			<p class="text-2xl font-semibold text-text-primary">{d.totalQuestions}</p>
		</div>
		<div class="rounded-md border border-border bg-surface-1 p-4">
			<p class="text-xs text-text-muted">Avg score</p>
			<p class="text-2xl font-semibold text-text-primary">{scorePercent(d.overallAvgScore)}</p>
		</div>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-lg font-medium text-text-primary">Activity</h2>
		<div class="flex flex-wrap gap-1">
			{#each d.heatmap as day}
				<div
					class="h-3 w-3 rounded-sm {heatmapColor(day.count)}"
					title="{day.date}: {day.count} questions"
				></div>
			{/each}
			{#if d.heatmap.length === 0}
				<p class="text-sm text-text-muted">No activity yet.</p>
			{/if}
		</div>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-lg font-medium text-text-primary">Skills</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
			{#each d.skills as skill}
				<div class="rounded-md border border-border bg-surface-1 p-3">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-text-primary">{skill.tag}</span>
						<span
							class="rounded-sm px-1.5 py-0.5 text-xs {levelColors[skill.level]} {levelBg[skill.level]}"
						>
							{skill.level}
						</span>
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
			{#if d.skills.length === 0}
				<p class="text-sm text-text-muted">Complete sessions to build your skill profile.</p>
			{/if}
		</div>
	</section>

	{#if d.repoCards.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-medium text-text-primary">Repositories</h2>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{#each d.repoCards as repo}
					<a
						href="/repo/{repo.repoSlug}"
						class="rounded-md border border-border bg-surface-1 p-4 transition hover:border-border-strong"
					>
						<p class="text-sm font-medium text-text-primary">{repo.repoSlug}</p>
						<p class="text-xs text-text-secondary">
							{repo.totalSessions} sessions · avg {scorePercent(repo.avgScore)}
						</p>
						{#if repo.topWeakTag}
							<p class="mt-1 text-xs text-state-warning">Weak: {repo.topWeakTag}</p>
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<section class="flex flex-col gap-3">
		<h2 class="text-lg font-medium text-text-primary">Recent sessions</h2>
		<div class="flex flex-col gap-2">
			{#each d.recentSessions as s}
				<div class="flex items-center justify-between rounded-md border border-border bg-surface-1 px-4 py-3">
					<div>
						<p class="text-sm font-medium text-text-primary">{s.repoSlug}</p>
						<p class="text-xs text-text-muted">
							{s.questionsPassed}/{s.questionsAttempted} passed
						</p>
					</div>
					<div class="text-right">
						<p class="text-sm text-text-primary">
							{s.confidenceScore !== null ? `${s.confidenceScore}%` : '—'}
						</p>
						<p class="text-xs text-text-muted">{s.state}</p>
					</div>
				</div>
			{/each}
			{#if d.recentSessions.length === 0}
				<p class="text-sm text-text-muted">No sessions yet.</p>
			{/if}
		</div>
	</section>

	{#if d.calibration.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-lg font-medium text-text-primary">Calibration</h2>
			<p class="text-xs text-text-secondary">
				Predicted confidence vs actual pass rate. Points near the diagonal are well-calibrated.
			</p>
			<div class="relative h-48 w-48 rounded-md border border-border bg-surface-1 p-2">
				<div class="absolute inset-2">
					<div class="absolute bottom-0 left-0 h-full w-full border-l border-b border-border-subtle"></div>
					{#each d.calibration as point}
						<div
							class="absolute h-2 w-2 rounded-full bg-accent"
							style="left: {point.predicted * 100}%; bottom: {point.actual * 100}%"
							title="pred={point.predicted} actual={point.actual.toFixed(2)} n={point.count}"
						></div>
					{/each}
				</div>
			</div>
		</section>
	{/if}
</main>
