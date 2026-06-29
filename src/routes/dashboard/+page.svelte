<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/client/Icon.svelte';
	import { averageScore, intensity, scorePercent } from '$lib/client/dashboard-helpers';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const d = $derived(data.dashboard);

	let dateLabel = $state('');

	onMount(() => {
		dateLabel = new Date().toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	});

	const totalAttempts = $derived(d.totalQuestions);
	const accuracy = $derived(d.overallAvgScore ?? 0);
	const accuracyPct = $derived(Math.round(accuracy * 100));

	const maxHeatCount = $derived(Math.max(1, ...d.heatmap.map((h) => h.count)));
	const sessionDays = $derived(d.heatmap.filter((h) => h.count > 0).length);
	const heatmapAvg = $derived(averageScore(d.heatmap.map((h) => ({ avgScore: h.avgScore }))));

	// Layout heatmap as 13-week grid (7 rows × 13 cols)
	const cols = 13;
	const rows = 7;
	const totalCells = cols * rows;
	const recentDays = $derived(d.heatmap.slice(-totalCells));

	const levelColors: Record<string, string> = {
		novice: 'hsl(var(--text-muted))',
		developing: 'hsl(var(--state-warning))',
		proficient: 'hsl(var(--state-info))',
		mastered: 'hsl(var(--state-success))'
	};

	const levelNames = ['novice', 'developing', 'proficient', 'mastered'];

	// Calibration chart geometry
	const W = 460;
	const H = 280;
	const pad = { l: 36, r: 16, t: 16, b: 36 };
	const ix = (v: number) => pad.l + v * (W - pad.l - pad.r);
	const iy = (v: number) => H - pad.b - v * (H - pad.t - pad.b);
</script>

<div class="page fade-up">
	<div class="hero">
		<div class="eyebrow">{dateLabel}</div>
		<h1 class="display hero-title">
			Welcome back.{' '}
			<span class="muted">
				{#if d.totalSessions > 0}
					You've shipped <span class="success">{d.totalSessions}</span> sessions and answered
					<span class="accent">{d.totalQuestions}</span> questions.
				{:else}
					Drop in a PR and let's get started.
				{/if}
			</span>
		</h1>

		<div class="hero-stats">
			<div class="hero-stat">
				<div class="eyebrow">Sessions</div>
				<div class="hero-value display tabular">{d.totalSessions}</div>
				<div class="hero-sub">last 90 days</div>
			</div>
			<div class="hero-stat">
				<div class="eyebrow">Accuracy</div>
				<div class="hero-value display tabular">
					{accuracyPct}<span class="suffix">%</span>
				</div>
				<div class="hero-sub">rolling average</div>
			</div>
			<div class="hero-stat">
				<div class="eyebrow">Questions</div>
				<div class="hero-value display tabular">{d.totalQuestions}</div>
				<div class="hero-sub">attempted</div>
			</div>
			<div class="hero-stat">
				<div class="eyebrow">Repos</div>
				<div class="hero-value display tabular">{d.repoCards.length}</div>
				<div class="hero-sub">in flight</div>
			</div>
		</div>
	</div>

	<section class="block">
		<div class="section-head">
			<span class="section-head-num">01</span>
			<div class="section-head-row">
				<span class="eyebrow">Activity</span>
				<h2 class="display section-title">The last 90 days.</h2>
			</div>
		</div>
		<div class="card card-pad heatmap-card">
			<div class="heatmap-meta">
				<div class="meta-block">
					<div class="display tabular meta-value">{sessionDays}</div>
					<div class="meta-label">active days</div>
				</div>
				<div class="meta-block">
					<div class="display tabular meta-value accent">
						{heatmapAvg !== null ? `${Math.round((heatmapAvg ?? 0) * 100)}%` : '—'}
					</div>
					<div class="meta-label">avg score</div>
				</div>
				<div class="meta-block">
					<div class="display tabular meta-value">{totalAttempts}</div>
					<div class="meta-label">questions</div>
				</div>
				<div class="spacer"></div>
				<div class="legend">
					<span>Less</span>
					{#each [0, 1, 2, 3, 4] as i (i)}
						<div
							class="legend-cell"
							style:background={i === 0
								? 'hsl(var(--surface-2))'
								: `hsl(var(--accent) / ${0.18 + i * 0.18})`}
						></div>
					{/each}
					<span>More</span>
				</div>
			</div>

			<div class="heatmap-grid">
				{#each recentDays as day, i (i)}
					{@const lvl = intensity(day.count, maxHeatCount)}
					<div
						class="hcell"
						style:background={lvl === 0
							? 'hsl(var(--surface-2))'
							: `hsl(var(--accent) / ${0.18 + lvl * 0.18})`}
						title={`${day.date}: ${day.count} questions${
							day.avgScore !== null ? `, ${Math.round(day.avgScore * 100)}%` : ''
						}`}
					></div>
				{/each}
				{#if recentDays.length === 0}
					<div class="empty">No activity yet. Start a session to populate the heatmap.</div>
				{/if}
			</div>
		</div>
	</section>

	<section class="grid-two">
		<div>
			<div class="section-head">
				<span class="section-head-num">02</span>
				<div class="section-head-row">
					<span class="eyebrow">Mastery</span>
					<h2 class="display section-title">Where you stand.</h2>
				</div>
			</div>
			{#if d.skills.length > 0}
				<div class="card">
					<div class="skill-head">
						<div>Tag</div>
						<div class="center">Level</div>
						<div class="center">Score</div>
						<div class="center">Attempts</div>
					</div>
					{#each d.skills as skill (skill.tag)}
						<div class="skill-row">
							<div class="skill-tag">
								<span class="mono">{skill.tag}</span>
								<span class="skill-pass">{Math.round(skill.passRate * 100)}% pass</span>
							</div>
							<div class="center">
								<span class="badge" style:color={levelColors[skill.level]}>
									{skill.level}
								</span>
							</div>
							<div class="skill-bar-wrap">
								<div class="skill-bar">
									<div
										class="skill-bar-fill"
										style:width={`${Math.round(skill.ewmaScore * 100)}%`}
									></div>
								</div>
							</div>
							<div class="center mono small muted">{skill.totalAttempts}</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="card card-pad muted">Complete sessions to build your skill profile.</div>
			{/if}
		</div>

		<div>
			<div class="section-head">
				<span class="section-head-num">03</span>
				<div class="section-head-row">
					<span class="eyebrow">Calibration</span>
					<h2 class="display section-title">Confidence vs accuracy.</h2>
				</div>
			</div>
			<div class="card card-pad">
				{#if d.calibration.length > 0}
					<div class="calib-head">
						<span class="eyebrow">Predicted vs Actual</span>
						<div class="spacer"></div>
						<span class="mono small muted">{d.calibration.length} bins</span>
					</div>
					<p class="small muted calib-note">
						Points near the diagonal mean you predict your accuracy well.
					</p>
					<svg viewBox={`0 0 ${W} ${H}`} class="calib-svg">
						{#each [0, 0.25, 0.5, 0.75, 1] as v (v)}
							<line
								x1={pad.l}
								x2={W - pad.r}
								y1={iy(v)}
								y2={iy(v)}
								stroke="hsl(var(--border-subtle))"
								stroke-dasharray="2 4"
							/>
							<line
								x1={ix(v)}
								x2={ix(v)}
								y1={pad.t}
								y2={H - pad.b}
								stroke="hsl(var(--border-subtle))"
								stroke-dasharray="2 4"
							/>
							<text
								x={pad.l - 6}
								y={iy(v) + 3}
								font-size="9"
								font-family="var(--font-mono)"
								fill="hsl(var(--text-disabled))"
								text-anchor="end">{(v * 100).toFixed(0)}</text
							>
							<text
								x={ix(v)}
								y={H - pad.b + 12}
								font-size="9"
								font-family="var(--font-mono)"
								fill="hsl(var(--text-disabled))"
								text-anchor="middle">{(v * 100).toFixed(0)}</text
							>
						{/each}
						<line
							x1={ix(0)}
							y1={iy(0)}
							x2={ix(1)}
							y2={iy(1)}
							stroke="hsl(var(--accent))"
							stroke-width="1"
							stroke-dasharray="4 4"
							opacity="0.5"
						/>
						{#each d.calibration as c, i (i)}
							<circle
								cx={ix(c.predicted)}
								cy={iy(c.actual)}
								r={Math.max(3, Math.min(10, c.count / 3))}
								fill="hsl(var(--state-warning))"
								stroke="hsl(var(--surface-1))"
								stroke-width="1.5"
								opacity="0.85"
							/>
						{/each}
						<text
							x={ix(0.5)}
							y={H - 4}
							font-size="10"
							font-family="var(--font-mono)"
							fill="hsl(var(--text-muted))"
							text-anchor="middle">predicted confidence</text
						>
					</svg>
				{:else}
					<p class="muted">Predict your confidence on a few questions to populate this chart.</p>
				{/if}
			</div>
		</div>
	</section>

	{#if d.repoCards.length > 0}
		<section class="block">
			<div class="section-head">
				<span class="section-head-num">04</span>
				<div class="section-head-row">
					<span class="eyebrow">Repositories</span>
					<h2 class="display section-title">
						{d.repoCards.length} codebase{d.repoCards.length === 1 ? '' : 's'} in flight.
					</h2>
				</div>
			</div>
			<div class="repo-grid">
				{#each d.repoCards as repo (repo.repoSlug)}
					{@const initial = repo.repoSlug.split('/').pop()?.[0]?.toUpperCase() ?? '?'}
					{@const masteryPct = Math.round((repo.avgScore ?? 0) * 100)}
					<a class="repo-card" href={`/repo/${encodeURIComponent(repo.repoSlug)}`}>
						<div class="repo-card-head">
							<div class="repo-mark">{initial}</div>
							<div class="repo-meta">
								<div class="repo-slug">{repo.repoSlug}</div>
								<div class="repo-sub">
									{repo.totalSessions} session{repo.totalSessions === 1 ? '' : 's'}
								</div>
							</div>
							<Icon name="arrow-right" size={14} color="hsl(var(--text-muted))" />
						</div>
						<div class="repo-mastery">
							<div class="repo-mastery-row">
								<span class="display tabular repo-score">{masteryPct}</span>
								<span class="small muted mono">/ 100 mastery</span>
							</div>
							<div class="repo-bar">
								<div class="repo-bar-fill" style:width={`${masteryPct}%`}></div>
							</div>
						</div>
						{#if repo.topWeakTag}
							<div class="repo-weak">
								<div class="eyebrow weak-eyebrow">Weakest spot</div>
								<span class="weak-tag">{repo.topWeakTag}</span>
							</div>
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if d.recentSessions.length > 0}
		<section class="block">
			<div class="section-head">
				<span class="section-head-num">{d.repoCards.length > 0 ? '05' : '04'}</span>
				<div class="section-head-row">
					<span class="eyebrow">Recent</span>
					<h2 class="display section-title">Last sessions.</h2>
				</div>
			</div>
			<div class="card">
				{#each d.recentSessions as s, i (s.sessionId)}
					<div class="session-row" class:last={i === d.recentSessions.length - 1}>
						<div>
							<div class="session-repo mono">{s.repoSlug}</div>
							<div class="small muted">
								{s.questionsPassed}/{s.questionsAttempted} passed · {s.state}
							</div>
						</div>
						<div class="session-meta">
							<span class="mono small">
								{s.confidenceScore !== null ? `${s.confidenceScore}%` : '—'}
							</span>
							{#if s.state === 'completed'}
								<a class="btn btn-sm btn-ghost" href={`/session/${s.sessionId}/debrief`}>
									Debrief <Icon name="arrow-right" size={12} />
								</a>
							{:else}
								<a class="btn btn-sm" href={`/session/${s.sessionId}`}>
									Resume <Icon name="arrow-right" size={12} />
								</a>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 1240px;
		margin: 0 auto;
		padding: 40px 48px 80px;
	}
	.hero {
		margin-bottom: 56px;
	}
	.hero-title {
		font-size: 56px;
		margin: 12px 0 0;
		max-width: 720px;
		color: hsl(var(--text-primary));
		letter-spacing: -0.025em;
	}
	.hero-title .muted {
		color: hsl(var(--text-muted));
	}
	.hero-title .accent {
		color: hsl(var(--accent));
		font-family: var(--font-mono);
	}
	.hero-title .success {
		color: hsl(var(--state-success));
	}

	.hero-stats {
		margin-top: 32px;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1px;
		background: hsl(var(--border-subtle));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 10px;
		overflow: hidden;
	}
	.hero-stat {
		background: hsl(var(--surface-1));
		padding: 20px 22px;
	}
	.hero-value {
		display: flex;
		align-items: baseline;
		gap: 4px;
		font-size: 38px;
		font-weight: 500;
		color: hsl(var(--text-primary));
		letter-spacing: -0.03em;
		margin-top: 12px;
	}
	.suffix {
		font-size: 18px;
		color: hsl(var(--text-muted));
		font-family: var(--font-mono);
	}
	.hero-sub {
		margin-top: 8px;
		font-size: 11.5px;
		color: hsl(var(--text-muted));
	}

	.block {
		margin-top: 56px;
	}
	.section-title {
		font-size: 22px;
		margin: 0;
		color: hsl(var(--text-primary));
	}
	.grid-two {
		margin-top: 56px;
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: 32px;
	}

	.heatmap-card .heatmap-meta {
		display: flex;
		align-items: baseline;
		gap: 24px;
		margin-bottom: 18px;
	}
	.meta-value {
		font-size: 28px;
	}
	.meta-value.accent {
		color: hsl(var(--accent));
	}
	.meta-label {
		font-size: 11px;
		color: hsl(var(--text-muted));
	}
	.spacer {
		flex: 1;
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: hsl(var(--text-muted));
	}
	.legend-cell {
		width: 11px;
		height: 11px;
		border-radius: 2px;
		border: 1px solid hsl(var(--border-subtle));
	}
	.heatmap-grid {
		display: grid;
		grid-template-columns: repeat(13, 1fr);
		grid-template-rows: repeat(7, 18px);
		grid-auto-flow: column;
		gap: 3px;
	}
	.hcell {
		border-radius: 3px;
		border: 1px solid hsl(var(--border-subtle));
	}
	.empty {
		grid-column: 1 / -1;
		text-align: center;
		color: hsl(var(--text-muted));
		padding: 24px;
	}

	.skill-head {
		display: grid;
		grid-template-columns: 1.6fr 100px 1fr 80px;
		padding: 10px 18px;
		border-bottom: 1px solid hsl(var(--border-subtle));
		font-size: 10px;
		font-family: var(--font-mono);
		color: hsl(var(--text-muted));
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.skill-row {
		display: grid;
		grid-template-columns: 1.6fr 100px 1fr 80px;
		align-items: center;
		gap: 12px;
		padding: 12px 18px;
		border-bottom: 1px solid hsl(var(--border-subtle));
		font-size: 13px;
	}
	.skill-row:last-child {
		border-bottom: none;
	}
	.skill-tag {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.skill-tag .mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	.skill-pass {
		font-size: 11px;
		color: hsl(var(--text-muted));
	}
	.center {
		text-align: center;
	}
	.skill-bar-wrap {
		padding: 0 8px;
	}
	.skill-bar {
		height: 5px;
		background: hsl(var(--surface-3));
		border-radius: 99px;
		overflow: hidden;
	}
	.skill-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, hsl(var(--accent-muted)), hsl(var(--accent)));
	}

	.calib-head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 8px;
	}
	.calib-note {
		margin-bottom: 8px;
	}
	.calib-svg {
		width: 100%;
		height: auto;
		margin-top: 8px;
	}

	.repo-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 18px;
	}
	.repo-card {
		text-align: left;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 10px;
		padding: 20px;
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
		gap: 14px;
		transition: all 160ms var(--ease-out);
	}
	.repo-card:hover {
		background: hsl(var(--surface-2));
		border-color: hsl(var(--border-default));
	}
	.repo-card-head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.repo-mark {
		width: 32px;
		height: 32px;
		border-radius: 7px;
		background: linear-gradient(135deg, hsl(var(--accent) / 0.3), hsl(var(--accent) / 0.05));
		border: 1px solid hsl(var(--accent) / 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--accent));
		font-weight: 600;
		font-family: var(--font-mono);
	}
	.repo-meta {
		flex: 1;
		min-width: 0;
	}
	.repo-slug {
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.repo-sub {
		font-size: 11px;
		color: hsl(var(--text-muted));
	}
	.repo-mastery-row {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 6px;
	}
	.repo-score {
		font-size: 32px;
		color: hsl(var(--text-primary));
	}
	.repo-bar {
		height: 5px;
		background: hsl(var(--surface-3));
		border-radius: 2px;
		overflow: hidden;
	}
	.repo-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, hsl(var(--accent-muted)), hsl(var(--accent)));
	}
	.repo-weak {
		border-top: 1px solid hsl(var(--border-subtle));
		padding-top: 12px;
	}
	.weak-eyebrow {
		margin-bottom: 6px;
	}
	.weak-tag {
		display: inline-block;
		font-size: 11.5px;
		font-family: var(--font-mono);
		padding: 2px 7px;
		background: hsl(var(--state-error-bg) / 0.4);
		color: hsl(var(--state-error));
		border: 1px solid hsl(var(--state-error) / 0.2);
		border-radius: 4px;
	}

	.session-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px 18px;
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	.session-row.last {
		border-bottom: none;
	}
	.session-repo {
		font-size: 13px;
		color: hsl(var(--text-primary));
		font-weight: 500;
	}
	.session-meta {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.small {
		font-size: 11.5px;
	}
	.muted {
		color: hsl(var(--text-muted));
	}
	.mono {
		font-family: var(--font-mono);
	}
</style>
