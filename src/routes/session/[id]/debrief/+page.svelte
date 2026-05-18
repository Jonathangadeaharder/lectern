<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/client/Icon.svelte';
	import { emit } from '$lib/client/sound/events';
	import { totalsAcrossChunks, bandFor } from '$lib/client/debrief-helpers';

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

	const bandColor = $derived(
		debrief?.band === 'high'
			? 'hsl(var(--state-success))'
			: debrief?.band === 'medium'
				? 'hsl(var(--state-warning))'
				: 'hsl(var(--state-error))'
	);

	const chunkTotals = $derived(totalsAcrossChunks(debrief?.perChunk ?? []));
	const totalAnswered = $derived(chunkTotals.answered);
	const totalQuestions = $derived(chunkTotals.total);
	const passedCount = $derived(chunkTotals.approxPassed);

	const scatterMaxSelf = $derived(
		Math.max(5, ...(debrief?.selfConfidence?.map((c) => c.selfConfidence) ?? [5]))
	);

	// Scatter geometry
	const W = 460;
	const H = 320;
	const pad = { l: 40, r: 16, t: 16, b: 36 };
	const ix = (v: number) => pad.l + v * (W - pad.l - pad.r);
	const iy = (v: number) => H - pad.b - v * (H - pad.t - pad.b);
</script>

<div class="page fade-up">
	<div class="head">
		<div class="head-eyebrow">
			<span class="eyebrow">Session debrief</span>
			{#if debrief}
				<span class="badge badge-accent">session · {data.sessionId.slice(0, 8)}</span>
			{/if}
		</div>

		{#if loading}
			<h1 class="display headline">Loading the breakdown…</h1>
		{:else if !debrief}
			<h1 class="display headline">No debrief available.</h1>
		{:else}
			<h1 class="display headline">
				You got{' '}
				<span style:color="hsl(var(--accent))">
					{passedCount} of {totalQuestions}
				</span>
				<span class="muted"> right.</span>
				<span class="muted">{' '}
					{#if debrief.band === 'high'}
						<span style:color="hsl(var(--state-success))">Solid.</span>
					{:else if debrief.band === 'medium'}
						<span style:color="hsl(var(--state-warning))">Some gaps to close.</span>
					{:else}
						<span style:color="hsl(var(--state-error))">Worth a re-read.</span>
					{/if}
				</span>
			</h1>
		{/if}

		<div class="head-actions">
			<button class="btn btn-sm" onclick={exportJson} disabled={!debrief?.rawSession}>
				<Icon name="download" size={13} /> Export JSON
			</button>
			<a class="btn btn-sm btn-ghost" href="/dashboard">Dashboard</a>
		</div>
	</div>

	{#if !loading && debrief}
		<div class="stat-grid">
			<div class="stat">
				<div class="eyebrow">Score</div>
				<div class="stat-value display tabular">
					{debrief.confidenceScore}<span class="suffix">%</span>
				</div>
				<div class="stat-sub" style:color={bandColor}>{bandLabel}</div>
			</div>
			<div class="stat">
				<div class="eyebrow">Questions</div>
				<div class="stat-value display tabular">{totalAnswered}</div>
				<div class="stat-sub muted">answered of {totalQuestions}</div>
			</div>
			<div class="stat">
				<div class="eyebrow">Chunks</div>
				<div class="stat-value display tabular">{debrief.perChunk.length}</div>
				<div class="stat-sub muted">in this session</div>
			</div>
			<div class="stat">
				<div class="eyebrow">Misses by tag</div>
				<div class="stat-value display tabular">{debrief.missedByTag.length}</div>
				<div class="stat-sub muted">topics flagged</div>
			</div>
		</div>

		<div class="grid-two">
			<div>
				<div class="section-head">
					<span class="section-head-num">01</span>
					<div class="section-head-row">
						<span class="eyebrow">Breakdown</span>
						<h2 class="display section-title">Per chunk.</h2>
					</div>
				</div>
				<div class="card">
					{#each debrief.perChunk as c, i (c.chunkId)}
						<div class="chunk-row" class:last={i === debrief.perChunk.length - 1}>
							<div class="chunk-meta">
								<div class="chunk-title">{c.title}</div>
								<div class="small muted">{c.note}</div>
							</div>
							<div class="chunk-bar">
								<div
									class="chunk-bar-fill"
									style:width={`${Math.max(2, c.score * 100)}%`}
									style:background={c.score >= 0.8
										? 'hsl(var(--state-success))'
										: c.score >= 0.5
											? 'hsl(var(--state-warning))'
											: 'hsl(var(--state-error))'}
								></div>
							</div>
							<div class="chunk-score mono">{Math.round(c.score * 100)}</div>
						</div>
					{/each}
				</div>

				{#if debrief.missedByTag.length > 0}
					<div class="section-head mt">
						<span class="section-head-num">02</span>
						<div class="section-head-row">
							<span class="eyebrow">Where it slipped</span>
							<h2 class="display section-title">Tags with misses.</h2>
						</div>
					</div>
					<div class="stack">
						{#each debrief.missedByTag as m (m.tag)}
							<div class="miss-row">
								<span class="miss-icon"><Icon name="x" size={12} /></span>
								<span class="mono miss-tag">{m.tag}</span>
								<div class="spacer"></div>
								<span class="mono small" style:color="hsl(var(--state-error))">
									{m.missCount} miss{m.missCount === 1 ? '' : 'es'}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div>
				<div class="section-head">
					<span class="section-head-num">03</span>
					<div class="section-head-row">
						<span class="eyebrow">Calibration</span>
						<h2 class="display section-title">Self vs computed.</h2>
					</div>
				</div>
				<div class="card card-pad">
					{#if debrief.selfConfidence && debrief.selfConfidence.length > 0}
						<svg viewBox={`0 0 ${W} ${H}`} class="scatter">
							<rect
								x={ix(0.5)}
								y={pad.t}
								width={ix(1) - ix(0.5)}
								height={iy(0) - pad.t}
								fill="hsl(var(--state-success) / 0.05)"
							/>
							<rect
								x={pad.l}
								y={iy(1)}
								width={ix(0.5) - pad.l}
								height={iy(0) - iy(1)}
								fill="hsl(var(--state-error) / 0.05)"
							/>
							{#each [0, 0.5, 1] as v (v)}
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
							{#each debrief.selfConfidence as pt (pt.questionId)}
								{@const x = ix(pt.selfConfidence / scatterMaxSelf)}
								{@const y = iy(pt.computedScore)}
								<circle
									cx={x}
									cy={y}
									r="5"
									fill={pt.computedScore >= 0.7
										? 'hsl(var(--state-success))'
										: pt.computedScore >= 0.4
											? 'hsl(var(--state-warning))'
											: 'hsl(var(--state-error))'}
									stroke="hsl(var(--surface-1))"
									stroke-width="1.5"
									opacity="0.9"
								/>
							{/each}
							<text
								x={ix(0.5)}
								y={H - 8}
								font-size="10"
								font-family="var(--font-mono)"
								fill="hsl(var(--text-muted))"
								text-anchor="middle">self-confidence →</text
							>
						</svg>
						<p class="small muted scatter-note">
							Above the diagonal = overconfident. Below = underconfident.
						</p>
					{:else}
						<p class="muted">No confidence ratings recorded.</p>
					{/if}
				</div>

				{#if debrief.followUps.length > 0}
					<div class="section-head mt">
						<span class="section-head-num">04</span>
						<div class="section-head-row">
							<span class="eyebrow">Recommended</span>
							<h2 class="display section-title">Three follow-ups.</h2>
						</div>
					</div>
					<div class="stack">
						{#each debrief.followUps as f, i (i)}
							<div class="rec-row">
								<div class="rec-num">{i + 1}</div>
								<div class="rec-text">{f}</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 1180px;
		margin: 0 auto;
		padding: 40px 48px 80px;
	}
	.head {
		position: relative;
	}
	.head-eyebrow {
		display: flex;
		align-items: baseline;
		gap: 12px;
		flex-wrap: wrap;
	}
	.headline {
		font-size: 48px;
		margin: 12px 0 0;
		letter-spacing: -0.025em;
		max-width: 920px;
	}
	.muted {
		color: hsl(var(--text-muted));
	}
	.head-actions {
		position: absolute;
		top: 0;
		right: 0;
		display: flex;
		gap: 8px;
	}

	.stat-grid {
		margin-top: 28px;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1px;
		background: hsl(var(--border-subtle));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 10px;
		overflow: hidden;
	}
	.stat {
		background: hsl(var(--surface-1));
		padding: 20px 22px;
	}
	.stat-value {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 36px;
		font-weight: 500;
		color: hsl(var(--text-primary));
		letter-spacing: -0.03em;
		margin-top: 12px;
	}
	.suffix {
		font-size: 16px;
		color: hsl(var(--text-muted));
	}
	.stat-sub {
		margin-top: 6px;
		font-size: 11.5px;
		font-family: var(--font-mono);
	}

	.grid-two {
		margin-top: 56px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 32px;
	}
	.section-title {
		font-size: 22px;
		margin: 0;
	}
	.mt {
		margin-top: 32px;
	}

	.chunk-row {
		display: grid;
		grid-template-columns: 1.4fr 1fr 60px;
		align-items: center;
		gap: 16px;
		padding: 14px 20px;
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	.chunk-row.last {
		border-bottom: none;
	}
	.chunk-title {
		font-size: 13px;
		font-weight: 500;
	}
	.chunk-bar {
		height: 6px;
		background: hsl(var(--surface-3));
		border-radius: 99px;
		overflow: hidden;
	}
	.chunk-bar-fill {
		height: 100%;
		transition: width 600ms var(--ease-emph);
	}
	.chunk-score {
		font-size: 13px;
		text-align: right;
		color: hsl(var(--text-secondary));
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.miss-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 8px;
	}
	.miss-icon {
		width: 22px;
		height: 22px;
		border-radius: 5px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--state-error-bg) / 0.5);
		color: hsl(var(--state-error));
	}
	.miss-tag {
		font-size: 12px;
	}
	.spacer {
		flex: 1;
	}

	.scatter {
		width: 100%;
		height: auto;
	}
	.scatter-note {
		margin-top: 8px;
	}

	.rec-row {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 14px;
		align-items: center;
		padding: 16px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 10px;
	}
	.rec-num {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 7px;
		background: hsl(var(--accent) / 0.12);
		color: hsl(var(--accent));
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 600;
	}
	.rec-text {
		font-size: 13.5px;
	}

	.small {
		font-size: 11.5px;
	}
	.mono {
		font-family: var(--font-mono);
	}
</style>
