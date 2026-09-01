<script lang="ts">
	import Slides from './surfaces/Slides.svelte';
	import QuizMode from './surfaces/QuizMode.svelte';
	import Mr from './surfaces/Mr.svelte';
	import { buildMutationQuizDeck, type MutationQuizProgress } from '$lib/shared/mutationQuiz';
	import {
		defaultMrReviewState,
		type MrBundle,
		type MrReviewState
	} from '$lib/shared/mr/types';

	interface VsCodeApi {
		postMessage(msg: unknown): void;
		setState(state: unknown): void;
		getState<T = unknown>(): T | undefined;
	}

	interface SlidesData {
		meta?: { title?: string };
		slides: Array<{
			position: number;
			title: string;
			body: string;
			covers: Array<{ path: string }>;
			bullets: Array<{ text: string; highlightLines: string; explanation: string }>;
			folds: number[];
			kind?: string;
			severity?: string;
			callout?: string;
		}>;
	}

	interface FilterLayer { version: 1; filters: unknown[] }
	interface AuthoredContentRevision {
		state: 'current' | 'stale' | 'unversioned' | 'unverified';
		message: string;
	}
	interface InitPayload {
		mr: { id: number; projectName: string; projectPath: string; webUrl: string };
		base: string | null;
		slides?: SlidesData | null;
		slidesError?: string | null;
		quiz?: unknown;
		quizError?: string | null;
		review?: unknown;
		session?: unknown;
		diff?: string | null;
		diffFilterLayers?: { user?: FilterLayer; perPr?: FilterLayer } | null;
		cheatsheet?: { entries: Array<{ symbol: string; kind: string; definition: string; location?: string }> } | null;
		mrBundle?: MrBundle | null;
		mrReviewState?: MrReviewState;
		reviewError?: string | null;
		authoredContentRevision?: AuthoredContentRevision | null;
		mutationQuizProgress?: MutationQuizProgress | null;
	}

	let { vscode }: { vscode: VsCodeApi } = $props();

	let init = $state<InitPayload | null>(null);
	let mrBundle = $state<MrBundle | null>(null);
	let mrReviewState = $state<MrReviewState>(defaultMrReviewState());
	let mrRefreshing = $state(false);
	let view = $state<'slides' | 'quiz' | 'review'>('review');

	function nextFrame(): Promise<void> {
		return new Promise((resolve) => requestAnimationFrame(() => resolve()));
	}

	async function completeMutationQuizForE2e(): Promise<boolean> {
		for (let step = 0; step < 1000; step += 1) {
			if (document.querySelector('[data-testid="mutation-complete"]')) return true;
			const nextButton = document.querySelector<HTMLButtonElement>('.primary-command');
			if (nextButton) {
				nextButton.click();
				await nextFrame();
				continue;
			}
			if (!mrBundle || !init?.mutationQuizProgress) return false;
			const deck = buildMutationQuizDeck(mrBundle.files, mrBundle.summary.diffRefs.headSha);
			const round = deck.rounds.find((candidate) => candidate.id === init?.mutationQuizProgress?.currentRoundId);
			if (!round) return false;
			const button = document.querySelector<HTMLButtonElement>(
				`button[aria-label="Patch ${round.buggyCandidateId.toUpperCase()} contains the bug"]`
			);
			if (!button) return false;
			button.click();
			await nextFrame();
		}
		return false;
	}

	window.addEventListener('message', (evt) => {
		const data = evt.data as { type?: string } | null;
		if (!data || typeof data.type !== 'string') return;
		switch (data.type) {
			case 'init': {
				const payload = data as unknown as InitPayload;
				const changedMr =
					init?.mr.id !== payload.mr.id || init?.mr.projectPath !== payload.mr.projectPath;
				init = payload;
				mrBundle = payload.mrBundle ?? null;
				mrReviewState = payload.mrReviewState ?? defaultMrReviewState();
				mrRefreshing = false;
				if (changedMr) view = 'review';
				return;
			}
			case 'mr:init':
				mrBundle = (data as { bundle?: MrBundle }).bundle ?? null;
				mrRefreshing = false;
				view = 'review';
				return;
			case 'mr:refreshFinished':
				mrRefreshing = false;
				return;
			case 'navigate': {
				const target = (data as { view?: 'slides' | 'quiz' | 'review' }).view;
				vscode.postMessage({ type: 'log', msg: `navigate received: ${target}` });
				if (target === 'slides' || target === 'quiz' || target === 'review') {
					view = target;
				}
				return;
			}
			case 'e2e:dump': {
				const reqId = (data as { reqId?: string }).reqId ?? '';
				const diffFilesBadge = document.querySelector('.diff-head .files-badge')?.textContent ?? null;
				const chips = Array.from(document.querySelectorAll('.chip')).map((el) => ({
					label: (el.querySelector('.label')?.textContent ?? el.textContent ?? '').trim(),
					on: el.classList.contains('on'),
					count: Number(el.querySelector('.count')?.textContent ?? '0') || 0
				}));
				const diffVisibleFileCount = document.querySelectorAll('.files .file').length;
				const diffHiddenBadge = document.querySelector('.hidden-strip .text strong')?.textContent ?? null;
				const activeTabs = Array.from(document.querySelectorAll('.tab.active'));
				const allTabs = Array.from(document.querySelectorAll('.tab')).map((el) => (el.textContent ?? '').trim());
				const emptyState = document.querySelector('.empty-state');
				const slideTitle = document.querySelector('.slide-render .title')?.textContent ?? null;
				const slideCount = document.querySelectorAll('.slide-render').length;
				const bulletCount = document.querySelectorAll('.slide-render .bullets li, .slide-render li').length;
				const mutationQuiz = document.querySelector('[data-testid="mutation-quiz"]');
				const mutationComplete = document.querySelector('[data-testid="mutation-complete"]');
				vscode.postMessage({
					type: 'e2e:dump:result',
					reqId,
					view,
					initReady: init !== null,
					hasBundle: init?.base !== null && init?.base !== undefined,
					mrId: init?.mr?.id ?? null,
					projectPath: init?.mr?.projectPath ?? null,
					tabs: allTabs,
					activeTabLabels: activeTabs.map((el) => (el.textContent ?? '').trim()),
					emptyStatePresent: emptyState !== null,
					emptyStateText: emptyState ? (emptyState.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
					slideTitle,
					slideCount,
					bulletCount,
					mutationQuizPresent: mutationQuiz !== null,
					mutationCandidateCount: mutationQuiz?.querySelectorAll('.patch-candidate').length ?? 0,
					mutationProgressText: mutationQuiz?.querySelector('.round-stats')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
					mutationResultText: mutationQuiz?.querySelector('.result')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
					mutationStatusLabels: Array.from(mutationQuiz?.querySelectorAll('.header-status') ?? []).map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
					mutationNextPresent: mutationQuiz?.querySelector('.primary-command') !== null,
					mutationCompletePresent: mutationComplete !== null,
					mutationCompletionHeading: mutationComplete?.querySelector('h1')?.textContent?.trim() ?? null,
					mutationCompletionStats: Array.from(mutationComplete?.querySelectorAll('.completion-stats strong') ?? []).map((element) => element.textContent?.trim() ?? ''),
					surfaceClientWidth: document.querySelector<HTMLElement>('.surface')?.clientWidth ?? null,
					documentTitle: document.title,
					bodyHeight: document.body.scrollHeight,
					initSlidesLength: (init?.slides as { slides?: unknown[] } | null | undefined)?.slides?.length ?? null,
					initQuizLength: (init?.quiz as { questions?: unknown[] } | null | undefined)?.questions?.length ?? null,
					initReviewCount: (init?.review as { findings?: unknown[] } | null | undefined)?.findings?.length ?? null,
					slidesEmptyMsg: document.querySelector('.surface .empty')?.textContent ?? null,
					structuralReviewPresent: document.querySelector('[data-testid="mr-page"]') !== null,
					fileRailPresent: document.querySelector('[data-testid="file-rail"]') !== null,
					threadRailPresent: document.querySelector('[data-testid="thread-rail"]') !== null,
					showFileRailPresent: document.querySelector('[aria-label="Show file sidebar"]') !== null,
					showThreadRailPresent: document.querySelector('[aria-label="Show threads sidebar"]') !== null,
					footerProgressText: document.querySelector('[data-testid="review-bar"] .label')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
					refreshMrPresent: document.querySelector('[data-testid="refresh-mr"]') !== null,
					refreshMrDisabled: document.querySelector<HTMLButtonElement>('[data-testid="refresh-mr"]')?.disabled ?? null,
					fileReviewCounts: Array.from(document.querySelectorAll('[data-testid="file-rail-item"] .review-count')).map((el) => (el.textContent ?? '').trim()),
					surfaceHtml: (document.querySelector('.surface')?.innerHTML ?? '').slice(0, 1200),
					diffFilesBadge,
					diffVisibleFileCount,
					diffHiddenBadge,
					diffChips: chips,
					consoleErrors: (window as unknown as { __e2eErrors?: string[] }).__e2eErrors ?? []
				});
				return;
			}
			case 'e2e:setView': {
				const target = (data as { view?: 'slides' | 'quiz' | 'review' }).view;
				if (target === 'slides' || target === 'quiz' || target === 'review') {
					view = target;
					vscode.postMessage({ type: 'e2e:setView:ack', view });
				}
				return;
			}
			case 'e2e:mutationAction': {
				const action = (data as { action?: string }).action ?? '';
				if (action === 'complete') {
					void completeMutationQuizForE2e().then((clicked) => {
						vscode.postMessage({ type: 'e2e:mutationAction:ack', action, clicked });
					});
					return;
				}
				let button: HTMLButtonElement | null = null;
				if ((action === 'choose-live' || action === 'choose-mutant') && mrBundle && init?.mutationQuizProgress) {
					const deck = buildMutationQuizDeck(mrBundle.files, mrBundle.summary.diffRefs.headSha);
					const round = deck.rounds.find((candidate) => candidate.id === init?.mutationQuizProgress?.currentRoundId);
					if (round) {
						const candidateId = action === 'choose-mutant'
							? round.buggyCandidateId
							: round.buggyCandidateId === 'a' ? 'b' : 'a';
						button = document.querySelector<HTMLButtonElement>(
							`button[aria-label="Patch ${candidateId.toUpperCase()} contains the bug"]`
						);
					}
				} else if (action === 'next') {
					button = document.querySelector<HTMLButtonElement>('.primary-command');
				}
				button?.click();
				requestAnimationFrame(() => {
					vscode.postMessage({ type: 'e2e:mutationAction:ack', action, clicked: button !== null });
				});
				return;
			}
			case 'e2e:reviewAction': {
				const action = (data as { action?: string }).action ?? '';
				const labels: Record<string, string> = {
					'collapse-file': 'Hide file sidebar',
					'collapse-threads': 'Hide threads sidebar',
					'reopen-file': 'Show file sidebar',
					'reopen-threads': 'Show threads sidebar',
					'review-first-file': 'Mark file reviewed',
					'refresh-mr': 'Refresh merge request'
				};
				const label = labels[action];
				const button = label
					? document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
					: null;
				button?.click();
				requestAnimationFrame(() => {
					vscode.postMessage({ type: 'e2e:reviewAction:ack', action, clicked: button !== null });
				});
				return;
			}
		}
	});

	function setView(next: 'slides' | 'quiz' | 'review'): void {
		view = next;
		vscode.postMessage({ type: 'navigate', view: next });
	}

	function snapshotMrReviewState(state: MrReviewState): MrReviewState {
		return {
			reviewedLineIds: [...state.reviewedLineIds],
			viewedPaths: [...state.viewedPaths],
			isFileRailOpen: state.isFileRailOpen,
			isThreadRailOpen: state.isThreadRailOpen
		};
	}

	function saveMrReviewState(state: MrReviewState): void {
		const snapshot = snapshotMrReviewState(state);
		vscode.setState({ mrReviewState: snapshot });
		vscode.postMessage({ type: 'saveMrReviewState', state: snapshot });
		mrReviewState = snapshot;
	}

	function refreshMr(): void {
		if (mrRefreshing) return;
		mrRefreshing = true;
		vscode.postMessage({
			type: 'refreshMr',
			state: snapshotMrReviewState(mrReviewState)
		});
	}

	function saveMutationQuizProgress(progress: MutationQuizProgress): void {
		if (init) init.mutationQuizProgress = progress;
		vscode.postMessage({ type: 'saveMutationQuizProgress', progress });
	}
</script>

<header class="toolbar">
	<div class="tab-strip" role="tablist" aria-label="PR view">
		<button class="tab" class:active={view === 'slides'} onclick={() => setView('slides')} role="tab" aria-selected={view === 'slides'}>Slides</button>
		<button class="tab" class:active={view === 'quiz'} onclick={() => setView('quiz')} role="tab" aria-selected={view === 'quiz'}>Quiz</button>
		<button class="tab" class:active={view === 'review'} onclick={() => setView('review')} role="tab" aria-selected={view === 'review'}>Review</button>
	</div>
	{#if init}
		<div class="breadcrumbs">
			<span class="crumb pr">!{init.mr.id}</span>
			<span class="crumb-sep" aria-hidden="true">›</span>
			<span class="crumb slug">{init.mr.projectPath}</span>
			<a class="crumb src" href={init.mr.webUrl} target="_blank" rel="noopener">source ↗</a>
		</div>
	{/if}
</header>

<main class="surface" class:mr-surface-host={view === 'review'}>
	{#if view === 'review'}
		{#if mrBundle}
			{#key `${mrBundle.summary.projectId}:${mrBundle.summary.iid}:${mrBundle.summary.diffRefs.headSha}`}
				<Mr
					bundle={mrBundle}
					reviewState={mrReviewState}
					refreshing={mrRefreshing}
					onRefresh={refreshMr}
					onReviewStateChange={saveMrReviewState}
				/>
			{/key}
		{:else if init?.reviewError}
			<section class="empty-state">
				<div class="empty-icon" aria-hidden="true">
					<span class="codicon codicon-git-pull-request"></span>
				</div>
				<h1 class="empty-title">Review unavailable</h1>
				<p class="empty-sub">{init.reviewError}</p>
			</section>
		{:else}
			<p class="loading">Loading review…</p>
		{/if}
	{:else if !init}
		<p class="loading">Loading…</p>
	{:else if view === 'quiz'}
		<QuizMode
			bundle={mrBundle}
			mutationProgress={init.mutationQuizProgress ?? null}
			onMutationProgress={saveMutationQuizProgress}
			authoredData={init.quiz ?? null}
			authoredDiff={init.diff ?? ''}
			authoredAvailable={init.base !== null}
			authoredError={init.quizError ?? null}
			authoredRevision={init.authoredContentRevision ?? null}
		/>
	{:else if init.base === null}
		<section class="empty-state">
			<div class="empty-icon" aria-hidden="true">
				<span class="codicon codicon-book"></span>
			</div>
			<h1 class="empty-title">No {view === 'slides' ? 'slides' : 'quiz'} authored yet</h1>
			<p class="empty-sub">
				Merge request <code>!{init.mr.id}</code> doesn't have an authored
				{view === 'slides' ? 'slide deck' : 'quiz'} on disk.
			</p>
			<div class="empty-cta">
				<p class="empty-hint">Author one with:</p>
				<code class="empty-cmd">/lectern {init.mr.webUrl}</code>
			</div>
		</section>
	{:else if view === 'slides' && init.slidesError}
		<section class="empty-state invalid-state">
			<div class="empty-icon" aria-hidden="true"><span class="codicon codicon-error"></span></div>
			<h1 class="empty-title">Slide deck invalid</h1>
			<p class="empty-sub">{init.slidesError}</p>
		</section>
	{:else if view === 'slides'}
		{#if init.authoredContentRevision && init.authoredContentRevision.state !== 'current'}
			<div class="revision-notice" role="status">
				<span class="codicon codicon-warning" aria-hidden="true"></span>
				<span>{init.authoredContentRevision.message}</span>
			</div>
		{/if}
		<Slides data={(init.slides as SlidesData | null) ?? null} />
	{/if}
</main>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		height: 100%;
		background: var(--vscode-editor-background);
		color: var(--vscode-foreground);
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size, 13px);
	}
	:global(#app) {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}

	.toolbar {
		display: flex;
		flex-direction: column;
		border-bottom: 1px solid var(--vscode-tab-border, transparent);
		background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-sideBar-background));
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.tab-strip {
		display: inline-flex;
		align-items: stretch;
		height: 35px;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 35px;
		padding: 0 18px;
		border: 0;
		border-right: 1px solid var(--vscode-tab-border, transparent);
		background: var(--vscode-tab-inactiveBackground);
		color: var(--vscode-tab-inactiveForeground);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		position: relative;
		transition: background 120ms ease-out, color 120ms ease-out;
	}
	.tab:hover {
		background: var(--vscode-tab-hoverBackground);
		color: var(--vscode-tab-hoverForeground);
	}
	.tab.active {
		background: var(--vscode-tab-activeBackground);
		color: var(--vscode-tab-activeForeground);
		font-weight: 500;
	}
	.tab.active::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--vscode-tab-activeBorderTop, var(--vscode-focusBorder));
	}

	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 24px;
		padding: 0 14px;
		background: var(--vscode-breadcrumb-background, var(--vscode-editor-background));
		border-top: 1px solid var(--vscode-breadcrumb-border, transparent);
		font-size: 12px;
		font-family: var(--vscode-editor-font-family, monospace);
		min-width: 0;
	}
	.crumb {
		color: var(--vscode-breadcrumb-foreground, var(--vscode-descriptionForeground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.crumb-sep {
		color: var(--vscode-breadcrumb-foreground, var(--vscode-descriptionForeground));
		opacity: 0.5;
		flex-shrink: 0;
	}
	.pr {
		font-weight: 600;
		color: var(--vscode-breadcrumb-focusForeground, var(--vscode-foreground));
		flex-shrink: 0;
	}
	.src {
		margin-left: auto;
		color: var(--vscode-textLink-foreground);
		text-decoration: none;
		flex-shrink: 0;
	}
	.src:hover {
		text-decoration: underline;
	}

	.surface {
		flex: 1;
		min-height: 0;
		overflow: auto;
		scrollbar-gutter: stable;
		display: block;
	}
	.surface.mr-surface-host {
		overflow: hidden;
	}

	.loading {
		color: var(--vscode-descriptionForeground);
		font-style: italic;
		text-align: center;
		padding: 48px 24px;
	}

	.empty-state {
		max-width: 480px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		margin: 64px auto;
		padding: 40px 32px;
		border: 1px solid var(--vscode-panel-border, var(--vscode-tab-border, transparent));
		border-radius: 6px;
		background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
	}
	.invalid-state .empty-icon {
		background: color-mix(in srgb, var(--vscode-errorForeground) 16%, transparent);
		color: var(--vscode-errorForeground);
	}
	.invalid-state .empty-sub {
		white-space: pre-wrap;
		text-align: left;
	}
	.revision-notice {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border-bottom: 1px solid var(--vscode-editorWarning-foreground);
		background: color-mix(in srgb, var(--vscode-editorWarning-foreground) 10%, transparent);
		color: var(--vscode-foreground);
		font-size: 12px;
		line-height: 1.4;
	}
	.empty-icon {
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
	}
	.empty-icon .codicon {
		font-size: 28px;
	}
	.empty-title {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: var(--vscode-foreground);
	}
	.empty-sub {
		margin: 0;
		font-size: 13px;
		line-height: 1.55;
		color: var(--vscode-descriptionForeground);
	}
	.empty-sub code {
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 12px;
		padding: 1px 5px;
		background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
		border-radius: 3px;
		color: var(--vscode-foreground);
	}
	.empty-cta {
		margin-top: 8px;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: stretch;
	}
	.empty-hint {
		margin: 0;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--vscode-descriptionForeground);
	}
	.empty-cmd {
		display: block;
		padding: 10px 14px;
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 12px;
		background: var(--vscode-textBlockQuote-background, var(--vscode-editor-background));
		border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, transparent));
		border-radius: 3px;
		color: var(--vscode-textLink-foreground);
		text-align: left;
		overflow-x: auto;
		white-space: nowrap;
	}
</style>
