<script lang="ts">
	import { onMount } from 'svelte';
	import BulletList from '$lib/components/presentation/BulletList.svelte';
	import CodePanel from '$lib/components/presentation/CodePanel.svelte';
	import ChangesetsPanel from '$lib/components/presentation/ChangesetsPanel.svelte';
	import SystematicPatterns from '$lib/components/presentation/SystematicPatterns.svelte';
	import CausalClaims from '$lib/components/presentation/CausalClaims.svelte';
	import GraphView from '$lib/components/presentation/GraphView.svelte';

	let { data } = $props();

	// ── Slide navigation ───────────────────────────────────────────────────────
	let currentIdx = $state(0);
	const slides = $derived(data.slides);
	const current = $derived(slides[currentIdx]);

	// Reset per-slide state when slide changes.
	let activeBullet = $state(0);
	let expandedFolds = $state(false);
	$effect(() => {
		currentIdx; // track reactive dependency
		activeBullet = 0;
		expandedFolds = false;
	});

	const activeBulletObj = $derived(
		current && current.bullets.length > 0 ? current.bullets[activeBullet] ?? null : null
	);
	const highlightRangeStr = $derived(activeBulletObj?.highlightLines ?? '');
	const hasBullets = $derived((current?.bullets.length ?? 0) > 0);

	function goPrev() {
		if (currentIdx > 0) currentIdx -= 1;
	}
	function goNext() {
		if (currentIdx < slides.length - 1) currentIdx += 1;
	}

	function handleKey(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'k') {
			e.preventDefault();
			goPrev();
		} else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'j' || e.key === ' ') {
			e.preventDefault();
			goNext();
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKey);

		// Hash-based tab routing.
		const fromHash = window.location.hash.slice(1);
		if (['changesets', 'patterns', 'claims', 'graph'].includes(fromHash)) {
			activeTab = fromHash as typeof activeTab;
		}

		return () => window.removeEventListener('keydown', handleKey);
	});

	// ── Tab navigation ─────────────────────────────────────────────────────────
	type Tab = 'slides' | 'changesets' | 'patterns' | 'claims' | 'graph';
	let activeTab = $state<Tab>('slides');

	function setTab(t: Tab) {
		activeTab = t;
		history.replaceState(null, '', `#${t}`);
	}

	// ── Coverage badge ─────────────────────────────────────────────────────────
	const coverageBadgeClass = $derived(
		data.presentation.coverageStatus === 'clean'
			? 'badge-green'
			: data.presentation.coverageStatus === 'uncovered'
				? 'badge-amber'
				: data.presentation.coverageStatus === 'fidelity_failed'
					? 'badge-red'
					: 'badge-gray'
	);

	const coverageHeadline = $derived(
		data.presentation.coverageHeadline
			? data.presentation.coverageHeadline
			: data.presentation.coverageStatus === 'clean'
				? `${data.presentation.totalAdditions} diff lines covered`
				: data.presentation.coverageStatus === 'uncovered'
					? `${data.presentation.totalAdditions - data.presentation.coveredAdditions} of ${data.presentation.totalAdditions} diff lines uncovered`
					: data.presentation.coverageStatus === 'fidelity_failed'
						? `${data.presentation.fidelityErrors.length} fidelity error(s)`
						: 'verifier not run'
	);

	// ── Verifier warning chip ──────────────────────────────────────────────────
	const slideHasWarning = $derived.by(() => {
		if (!current) return false;
		const warnings = data.presentation.uncoveredBySlide as Record<number, boolean> | undefined;
		return warnings?.[current.position] ?? false;
	});

	// ── Graph data ─────────────────────────────────────────────────────────────
	const graphData = $derived.by(() => {
		const raw = data.extras?.graphJson;
		if (!raw) return null;
		try {
			return JSON.parse(raw) as import('$lib/server/services/presentation/types').CodeGraph;
		} catch {
			return null;
		}
	});

	// ── Causal claim navigation (backlink → slide) ─────────────────────────────
	function navigateToSlide(backlink: string) {
		// backlink format: "path/to/file.ts:42"
		const [path, lineStr] = backlink.split(':');
		if (!path || !lineStr) return;
		const line = Number.parseInt(lineStr, 10);
		const slideIdx = slides.findIndex((s) =>
			s.covers.some((r) => r.path === path && r.start <= line && r.end >= line)
		);
		if (slideIdx >= 0) {
			currentIdx = slideIdx;
			setTab('slides');
		}
	}
</script>

<div class="page">
	<header class="topbar">
		<div class="meta">
			<span class="repo">{data.bundle.repoSlug}</span>
			<span class="pr">!{data.bundle.prNumber}</span>
			<a class="source" href={data.bundle.sourceUrl} target="_blank" rel="noopener">source</a>
		</div>

		<nav class="tabs" aria-label="Presentation views">
			{#each [['slides', 'Slides'], ['changesets', 'Changesets'], ['patterns', 'Patterns'], ['claims', 'Claims'], ['graph', 'Graph']] as [tab, label] (tab)}
				<button
					class="tab-btn"
					class:active={activeTab === tab}
					onclick={() => setTab(tab as Tab)}
				>{label}</button>
			{/each}
		</nav>

		<div class="coverage">
			<span class="badge {coverageBadgeClass}">{data.presentation.coverageStatus}</span>
			<span class="coverage-text">{coverageHeadline}</span>
		</div>
		<div class="nav-counter">
			{#if activeTab === 'slides'}
				Slide {currentIdx + 1} / {slides.length}
			{/if}
		</div>
	</header>

	<main class="content">
		{#if activeTab === 'slides'}
			<div class="slide-view" class:has-bullets={hasBullets}>
				{#if hasBullets}
					<aside class="bullets-pane">
						<BulletList
							bullets={current?.bullets ?? []}
							activeIndex={activeBullet}
							onSelect={(i) => (activeBullet = i)}
						/>

						{#if activeBulletObj?.explanation}
							<div class="bullet-explanation">
								<h4>Why this matters</h4>
								<p>{activeBulletObj.explanation}</p>
							</div>
						{/if}
					</aside>
				{/if}

				<div class="code-pane">
					{#if current}
						<CodePanel
							text={current.body}
							highlightRangeStr={highlightRangeStr}
							folds={current.folds ?? []}
							{expandedFolds}
						/>
					{:else}
						<p class="empty-slide">Empty deck.</p>
					{/if}
				</div>

				<aside class="annotations-pane">
					{#if current}
						<section>
							<h4>Covers</h4>
							{#if current.covers.length === 0}
								<p class="empty">No diff coverage from this slide.</p>
							{:else}
								<ul>
									{#each current.covers as r, i (i)}
										<li>
											<code>{r.path}</code>:<span class="range">{r.start}-{r.end}</span>
										</li>
									{/each}
								</ul>
							{/if}
						</section>

						<section>
							<h4>Verbatim ranges</h4>
							{#if current.verbatimRanges.length === 0}
								<p class="empty">{current.nofidelity ? 'Marked nofidelity.' : 'None.'}</p>
							{:else}
								<ul>
									{#each current.verbatimRanges as r, i (i)}
										<li>
											<code>{r.path}</code>:<span class="range">{r.start}-{r.end}</span>
										</li>
									{/each}
								</ul>
							{/if}
						</section>

						{#if slideHasWarning}
							<div class="warning-chip">Uncovered lines on this slide</div>
						{/if}

						<details class="md-source">
							<summary>Raw slide markdown</summary>
							<pre class="md-body">{current.body}</pre>
						</details>

						{#if (current.folds?.length ?? 0) > 0}
							<section>
								<button
									class="fold-toggle"
									onclick={() => (expandedFolds = !expandedFolds)}
								>
									{expandedFolds ? 'Collapse' : 'Expand'} boilerplate folds
								</button>
							</section>
						{/if}
					{/if}
				</aside>
			</div>

			<footer class="controls">
				<button onclick={goPrev} disabled={currentIdx === 0}>← Prev</button>
				<button onclick={goNext} disabled={currentIdx === slides.length - 1}>Next →</button>
			</footer>

		{:else if activeTab === 'changesets'}
			<div class="full-tab">
				<ChangesetsPanel changesets={data.extras?.changesets ?? []} />
			</div>

		{:else if activeTab === 'patterns'}
			<div class="full-tab">
				<SystematicPatterns patterns={data.extras?.systematicPatterns ?? []} />
			</div>

		{:else if activeTab === 'claims'}
			<div class="full-tab">
				<CausalClaims
					claims={data.extras?.causalClaims ?? []}
					onNavigateToSlide={navigateToSlide}
				/>
			</div>

		{:else if activeTab === 'graph'}
			<div class="full-tab">
				<GraphView graph={graphData} />
			</div>
		{/if}
	</main>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		font-family: var(--font-sans, system-ui);
		background: hsl(var(--surface-0, 220 13% 8%));
		color: hsl(var(--text-default, 220 9% 92%));
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 18px;
		border-bottom: 1px solid hsl(var(--border-subtle, 220 13% 16%));
		background: hsl(var(--surface-1, 220 13% 11%));
		font-size: 13px;
		gap: 12px;
	}

	.meta {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.meta .repo {
		font-weight: 600;
	}
	.meta .pr {
		color: hsl(var(--text-muted, 220 9% 60%));
	}
	.meta .source {
		color: hsl(var(--accent, 200 90% 60%));
		text-decoration: none;
		font-size: 11px;
		margin-left: 6px;
	}

	.tabs {
		display: flex;
		gap: 2px;
	}

	.tab-btn {
		padding: 5px 12px;
		border-radius: 5px;
		border: 1px solid transparent;
		background: transparent;
		color: hsl(var(--text-muted, 220 9% 60%));
		font-size: 12px;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}

	.tab-btn:hover {
		background: hsl(var(--surface-2, 220 13% 16%));
		color: hsl(var(--text-default, 220 9% 88%));
	}

	.tab-btn.active {
		border-color: hsl(var(--accent, 200 90% 55%));
		background: hsl(200 90% 15% / 0.4);
		color: hsl(var(--text-default, 220 9% 92%));
	}

	.coverage {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.badge {
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.badge-green {
		background: hsl(140 40% 30%);
		color: hsl(140 60% 90%);
	}
	.badge-amber {
		background: hsl(35 50% 30%);
		color: hsl(35 80% 90%);
	}
	.badge-red {
		background: hsl(0 50% 35%);
		color: hsl(0 70% 95%);
	}
	.badge-gray {
		background: hsl(220 5% 25%);
		color: hsl(220 5% 80%);
	}
	.coverage-text {
		color: hsl(var(--text-muted, 220 9% 60%));
		font-size: 12px;
	}
	.nav-counter {
		color: hsl(var(--text-muted, 220 9% 60%));
		font-size: 12px;
		min-width: 90px;
		text-align: right;
	}

	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.slide-view {
		display: grid;
		grid-template-columns: 1fr 280px;
		gap: 12px;
		padding: 16px;
		flex: 1;
		overflow: hidden;
	}

	.slide-view.has-bullets {
		grid-template-columns: 220px 1fr 240px;
	}

	@media (max-width: 768px) {
		.slide-view,
		.slide-view.has-bullets {
			grid-template-columns: 1fr;
		}
	}

	.bullets-pane {
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow-y: auto;
	}

	.bullet-explanation {
		padding: 10px 12px;
		background: hsl(var(--surface-1, 220 13% 11%));
		border: 1px solid hsl(var(--border-subtle, 220 13% 18%));
		border-radius: 6px;
		font-size: 12px;
	}

	.bullet-explanation h4 {
		margin: 0 0 4px;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: hsl(var(--text-muted, 220 9% 55%));
	}

	.bullet-explanation p {
		margin: 0;
		color: hsl(var(--text-muted, 220 9% 65%));
		line-height: 1.45;
	}

	.code-pane {
		overflow: hidden;
		border-radius: 8px;
		border: 1px solid hsl(var(--border-subtle, 220 13% 18%));
	}

	.empty-slide {
		padding: 24px;
		color: hsl(var(--text-muted, 220 9% 55%));
	}

	.annotations-pane {
		background: hsl(var(--surface-1, 220 13% 11%));
		border: 1px solid hsl(var(--border-subtle, 220 13% 18%));
		border-radius: 8px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		font-size: 12px;
		overflow-y: auto;
	}

	.annotations-pane h4 {
		margin: 0 0 6px 0;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: hsl(var(--text-muted, 220 9% 60%));
	}

	.annotations-pane ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.annotations-pane li {
		font-family: var(--font-mono, ui-monospace);
		margin-bottom: 4px;
		font-size: 11px;
		overflow-wrap: anywhere;
	}

	.annotations-pane .range {
		color: hsl(var(--accent, 200 90% 60%));
		margin-left: 4px;
	}

	.annotations-pane .empty {
		font-style: italic;
		color: hsl(var(--text-disabled, 220 9% 45%));
	}

	.warning-chip {
		padding: 4px 10px;
		background: hsl(35 60% 25%);
		border: 1px solid hsl(35 70% 40%);
		border-radius: 6px;
		font-size: 11px;
		color: hsl(35 80% 85%);
	}

	.md-source {
		font-size: 11px;
	}

	.md-source summary {
		cursor: pointer;
		color: hsl(var(--text-muted, 220 9% 55%));
		margin-bottom: 4px;
		user-select: none;
	}

	.md-body {
		font-family: var(--font-mono, ui-monospace);
		font-size: 10px;
		background: hsl(var(--surface-0, 220 13% 8%));
		border: 1px solid hsl(var(--border-subtle, 220 13% 16%));
		border-radius: 4px;
		padding: 8px;
		white-space: pre-wrap;
		overflow-x: auto;
		max-height: 200px;
		overflow-y: auto;
		margin: 0;
		color: hsl(var(--text-muted, 220 9% 65%));
	}

	.fold-toggle {
		padding: 5px 10px;
		border: 1px solid hsl(var(--border-subtle, 220 13% 22%));
		border-radius: 5px;
		background: hsl(var(--surface-2, 220 13% 16%));
		color: hsl(var(--text-default, 220 9% 85%));
		font-size: 11px;
		cursor: pointer;
		width: 100%;
	}

	.fold-toggle:hover {
		background: hsl(var(--surface-3, 220 13% 20%));
	}

	.full-tab {
		flex: 1;
		overflow: hidden;
		padding: 16px;
	}

	.controls {
		display: flex;
		gap: 12px;
		padding: 12px 16px;
		border-top: 1px solid hsl(var(--border-subtle, 220 13% 16%));
		background: hsl(var(--surface-1, 220 13% 11%));
	}

	button {
		padding: 6px 14px;
		font-size: 13px;
		background: hsl(var(--surface-2, 220 13% 16%));
		border: 1px solid hsl(var(--border-subtle, 220 13% 22%));
		border-radius: 6px;
		color: hsl(var(--text-default, 220 9% 92%));
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: hsl(var(--surface-3, 220 13% 22%));
	}

	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
