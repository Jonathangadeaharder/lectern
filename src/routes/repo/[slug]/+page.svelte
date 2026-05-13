<script lang="ts">
	import Icon from '$lib/client/Icon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const p = $derived(data.profile);

	const initial = $derived(p.repoSlug.split('/').pop()?.[0]?.toUpperCase() ?? '?');
	const masteryPct = $derived(Math.round((p.competence?.avgScore ?? 0) * 100));

	function scorePercent(score: number | null): string {
		if (score === null) return '—';
		return `${Math.round(score * 100)}%`;
	}

	const levelColors: Record<string, string> = {
		novice: 'hsl(var(--text-muted))',
		developing: 'hsl(var(--state-warning))',
		proficient: 'hsl(var(--state-info))',
		mastered: 'hsl(var(--state-success))'
	};
</script>

<div class="page fade-up">
	<div class="head">
		<div class="head-eyebrow">
			<span class="eyebrow">Repository · learning</span>
			{#if p.competence}
				<span class="badge">{p.competence.totalSessions} sessions</span>
				<span class="badge">{p.competence.totalQuestions} questions</span>
			{/if}
		</div>
		<div class="head-row">
			<div class="repo-mark">{initial}</div>
			<div>
				<h1 class="display repo-title">{p.repoSlug}</h1>
				<div class="repo-sub">
					{#if p.competence}
						Avg score {scorePercent(p.competence.avgScore)} across {p.competence.totalSessions} session{p.competence.totalSessions === 1 ? '' : 's'}.
					{:else}
						No sessions for this repo yet.
					{/if}
				</div>
			</div>
		</div>
	</div>

	<div class="grid-two">
		<div>
			{#if p.skills.length > 0}
				<div class="section-head">
					<span class="section-head-num">01</span>
					<div class="section-head-row">
						<span class="eyebrow">Pulse</span>
						<h2 class="display section-title">Patterns in this codebase.</h2>
					</div>
				</div>
				<div class="card pulse-card">
					{#each p.skills as skill, i (skill.tag)}
						<div class="pulse-row" class:last={i === p.skills.length - 1}>
							<div>
								<div class="pulse-name mono">{skill.tag}</div>
								<div class="small muted">{skill.totalAttempts} attempts</div>
							</div>
							<div class="pulse-bar">
								<div
									class="pulse-bar-fill"
									style:width={`${Math.round(skill.ewmaScore * 100)}%`}
									style:background={skill.ewmaScore > 0.7
										? 'hsl(var(--state-success))'
										: skill.ewmaScore > 0.5
											? 'hsl(var(--accent))'
											: 'hsl(var(--state-warning))'}
								></div>
							</div>
							<div class="pulse-score mono">{Math.round(skill.ewmaScore * 100)}</div>
							<div class="pulse-level" style:color={levelColors[skill.level]}>
								{skill.level}
							</div>
						</div>
					{/each}
				</div>
			{/if}

			{#if p.bugPatterns.length > 0}
				<div class="section-head mt">
					<span class="section-head-num">02</span>
					<div class="section-head-row">
						<span class="eyebrow">Bug archetypes</span>
						<h2 class="display section-title">What this repo tends to get wrong.</h2>
					</div>
				</div>
				<div class="stack">
					{#each p.bugPatterns as bp, i (i)}
						<div class="bug-card">
							<div class="bug-meta">
								<div class="bug-summary">{bp.summary}</div>
								{#if bp.rootCause}
									<div class="bug-cause mono">{bp.rootCause}</div>
								{/if}
							</div>
							<div class="bug-pips">
								{#each Array.from({ length: Math.min(bp.frequency, 8) }) as _, j (j)}
									<div class="bug-pip"></div>
								{/each}
							</div>
							<span class="mono small muted">
								{bp.frequency}× · {Math.round(bp.confidence * 100)}%
							</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if p.weakSpots.length > 0}
				<div class="section-head mt">
					<span class="section-head-num">{p.bugPatterns.length > 0 ? '03' : '02'}</span>
					<div class="section-head-row">
						<span class="eyebrow">Weakest spots</span>
						<h2 class="display section-title">Where to focus next.</h2>
					</div>
				</div>
				<div class="stack">
					{#each p.weakSpots as ws (ws.tag)}
						<div class="weak-row">
							<span class="weak-tag">{ws.tag}</span>
							<div class="spacer"></div>
							<span class="mono small" style:color="hsl(var(--state-warning))">
								{Math.round(ws.missRate * 100)}% miss
							</span>
							<span class="small muted">{ws.sampleCount} samples</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<aside class="mastery card card-pad">
			<div class="eyebrow">Overall mastery</div>
			<div class="mastery-row">
				<span class="display tabular mastery-num">{masteryPct}</span>
				<span class="mono muted">/ 100</span>
			</div>
			<div class="mastery-bar">
				<div class="mastery-bar-fill" style:width={`${masteryPct}%`}></div>
			</div>

			{#if p.competence}
				<div class="kv">
					<div class="kv-row">
						<span class="kv-label">Sessions</span>
						<span class="kv-value mono">{p.competence.totalSessions}</span>
					</div>
					<div class="kv-row">
						<span class="kv-label">Questions</span>
						<span class="kv-value mono">{p.competence.totalQuestions}</span>
					</div>
					<div class="kv-row">
						<span class="kv-label">Avg score</span>
						<span class="kv-value mono">{scorePercent(p.competence.avgScore)}</span>
					</div>
				</div>
			{/if}

			<a class="btn btn-primary resume" href="/">
				Resume next PR <Icon name="arrow-right" size={13} />
			</a>
		</aside>
	</div>

	{#if p.conventions.length > 0}
		<section class="block">
			<div class="section-head">
				<span class="section-head-num">04</span>
				<div class="section-head-row">
					<span class="eyebrow">Conventions</span>
					<h2 class="display section-title">House style notes.</h2>
				</div>
			</div>
			<div class="stack">
				{#each p.conventions as conv (conv.filePath)}
					<div class="conv-row">
						<span class="mono conv-source">{conv.source}</span>
						<span class="mono small muted">{conv.filePath}</span>
						{#if conv.summary}
							<div class="conv-summary">{conv.summary}</div>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if p.recentActivity.length > 0}
		<section class="block">
			<div class="section-head">
				<span class="section-head-num">{p.conventions.length > 0 ? '05' : '04'}</span>
				<div class="section-head-row">
					<span class="eyebrow">Recent</span>
					<h2 class="display section-title">Activity log.</h2>
				</div>
			</div>
			<div class="card activity">
				{#each p.recentActivity as act, i (act.date)}
					<div class="activity-row" class:last={i === p.recentActivity.length - 1}>
						<span class="mono small muted">{act.date}</span>
						<span class="small">{act.questionsPassed}/{act.questionsAttempted} passed</span>
						<div class="spacer"></div>
						<span class="mono">{scorePercent(act.avgScore)}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 1180px;
		margin: 0 auto;
		padding: 40px 48px 80px;
	}
	.head {
		margin-bottom: 32px;
	}
	.head-eyebrow {
		display: flex;
		align-items: baseline;
		gap: 12px;
		flex-wrap: wrap;
	}
	.head-row {
		display: flex;
		align-items: center;
		gap: 18px;
		margin-top: 12px;
	}
	.repo-mark {
		width: 56px;
		height: 56px;
		border-radius: 12px;
		background: linear-gradient(135deg, hsl(var(--accent) / 0.3), hsl(var(--accent) / 0.05));
		border: 1px solid hsl(var(--accent) / 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--accent));
		font-family: var(--font-mono);
		font-size: 22px;
		font-weight: 600;
	}
	.repo-title {
		font-size: 36px;
		margin: 0;
		font-family: var(--font-mono);
		font-weight: 500;
		letter-spacing: -0.02em;
	}
	.repo-sub {
		margin-top: 4px;
		font-size: 13px;
		color: hsl(var(--text-muted));
	}
	.grid-two {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 32px;
	}
	.section-title {
		font-size: 22px;
		margin: 0;
		color: hsl(var(--text-primary));
	}
	.mt {
		margin-top: 32px;
	}
	.block {
		margin-top: 56px;
	}

	.pulse-card {
		display: flex;
		flex-direction: column;
	}
	.pulse-row {
		display: grid;
		grid-template-columns: 1.5fr 1fr 60px 100px;
		align-items: center;
		gap: 16px;
		padding: 12px 20px;
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	.pulse-row.last {
		border-bottom: none;
	}
	.pulse-name {
		font-size: 13px;
		font-weight: 500;
	}
	.pulse-bar {
		height: 5px;
		background: hsl(var(--surface-3));
		border-radius: 99px;
		overflow: hidden;
	}
	.pulse-bar-fill {
		height: 100%;
	}
	.pulse-score {
		font-size: 12px;
		color: hsl(var(--text-secondary));
		text-align: right;
	}
	.pulse-level {
		font-size: 11px;
		font-family: var(--font-mono);
		text-align: right;
		text-transform: capitalize;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.bug-card {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 14px;
		padding: 14px 18px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 8px;
		align-items: center;
	}
	.bug-summary {
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 3px;
	}
	.bug-cause {
		font-size: 11px;
		color: hsl(var(--text-muted));
	}
	.bug-pips {
		display: flex;
		gap: 3px;
	}
	.bug-pip {
		width: 8px;
		height: 20px;
		border-radius: 1px;
		background: hsl(var(--state-success));
	}

	.weak-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 18px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 8px;
	}
	.weak-tag {
		font-size: 12px;
		font-family: var(--font-mono);
		padding: 2px 7px;
		background: hsl(var(--state-error-bg) / 0.4);
		color: hsl(var(--state-error));
		border: 1px solid hsl(var(--state-error) / 0.2);
		border-radius: 4px;
	}
	.spacer {
		flex: 1;
	}

	.mastery {
		position: sticky;
		top: 24px;
		align-self: start;
	}
	.mastery-row {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-top: 8px;
	}
	.mastery-num {
		font-size: 56px;
		color: hsl(var(--text-primary));
		letter-spacing: -0.04em;
	}
	.mastery-bar {
		margin-top: 12px;
		height: 8px;
		background: hsl(var(--surface-3));
		border-radius: 99px;
		overflow: hidden;
	}
	.mastery-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, hsl(var(--accent-muted)), hsl(var(--accent)));
		box-shadow: 0 0 12px hsl(var(--accent) / 0.6);
	}
	.kv {
		margin-top: 22px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.kv-row {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
	}
	.kv-label {
		color: hsl(var(--text-muted));
	}
	.kv-value {
		color: hsl(var(--text-primary));
	}
	.resume {
		width: 100%;
		justify-content: center;
		margin-top: 22px;
	}

	.conv-row {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 10px;
		padding: 12px 18px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 8px;
	}
	.conv-source {
		font-size: 12px;
		color: hsl(var(--accent));
	}
	.conv-summary {
		grid-column: 1 / -1;
		font-size: 12px;
		color: hsl(var(--text-secondary));
		margin-top: 4px;
	}

	.activity {
		display: flex;
		flex-direction: column;
	}
	.activity-row {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 10px 18px;
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	.activity-row.last {
		border-bottom: none;
	}

	.muted {
		color: hsl(var(--text-muted));
	}
	.small {
		font-size: 11.5px;
	}
	.mono {
		font-family: var(--font-mono);
	}
</style>
