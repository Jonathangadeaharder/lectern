<script lang="ts">
	import Slides from './surfaces/Slides.svelte';
	import Quiz from './surfaces/Quiz.svelte';
	import Review from './surfaces/Review.svelte';
	import Diff from './surfaces/Diff.svelte';

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

	interface InitPayload {
		mr: { id: number; projectName: string; projectPath: string; webUrl: string };
		base: string | null;
		slides?: SlidesData | null;
		quiz?: unknown;
		review?: unknown;
		session?: unknown;
		diff?: string | null;
		cheatsheet?: { entries: Array<{ symbol: string; kind: string; definition: string; location?: string }> } | null;
	}

	let { vscode }: { vscode: VsCodeApi } = $props();

	let init = $state<InitPayload | null>(null);
	let view = $state<'slides' | 'quiz' | 'review' | 'diff'>('slides');

	window.addEventListener('message', (evt) => {
		const data = evt.data as { type?: string } | null;
		if (!data || typeof data.type !== 'string') return;
		switch (data.type) {
			case 'init':
				init = data as unknown as InitPayload;
				return;
			case 'navigate': {
				const target = (data as { view?: 'slides' | 'quiz' | 'review' | 'diff' }).view;
				vscode.postMessage({ type: 'log', msg: `navigate received: ${target}` });
				if (target === 'slides' || target === 'quiz' || target === 'review' || target === 'diff') {
					view = target;
				}
				return;
			}
			case 'e2e:dump': {
				const reqId = (data as { reqId?: string }).reqId ?? '';
				const activeTabs = Array.from(document.querySelectorAll('.tab.active'));
				const allTabs = Array.from(document.querySelectorAll('.tab')).map((el) => (el.textContent ?? '').trim());
				const emptyState = document.querySelector('.empty-state');
				const slideTitle = document.querySelector('.slide-render .title')?.textContent ?? null;
				const slideCount = document.querySelectorAll('.slide-render').length;
				const bulletCount = document.querySelectorAll('.slide-render .bullets li, .slide-render li').length;
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
					documentTitle: document.title,
					bodyHeight: document.body.scrollHeight,
					initSlidesLength: (init?.slides as { slides?: unknown[] } | null | undefined)?.slides?.length ?? null,
					initQuizLength: (init?.quiz as { questions?: unknown[] } | null | undefined)?.questions?.length ?? null,
					initReviewCount: (init?.review as { findings?: unknown[] } | null | undefined)?.findings?.length ?? null,
					slidesEmptyMsg: document.querySelector('.surface .empty')?.textContent ?? null,
					surfaceHtml: (document.querySelector('.surface')?.innerHTML ?? '').slice(0, 1200),
					consoleErrors: (window as unknown as { __e2eErrors?: string[] }).__e2eErrors ?? []
				});
				return;
			}
			case 'e2e:setView': {
				const target = (data as { view?: 'slides' | 'quiz' | 'review' | 'diff' }).view;
				if (target === 'slides' || target === 'quiz' || target === 'review') {
					view = target;
					vscode.postMessage({ type: 'e2e:setView:ack', view });
				}
				return;
			}
		}
	});

	function setView(next: 'slides' | 'quiz' | 'review' | 'diff'): void {
		view = next;
		vscode.postMessage({ type: 'navigate', view: next });
	}
</script>

<header class="toolbar">
	<div class="tab-strip" role="tablist" aria-label="PR view">
		<button class="tab" class:active={view === 'slides'} onclick={() => setView('slides')} role="tab" aria-selected={view === 'slides'}>Slides</button>
		<button class="tab" class:active={view === 'quiz'} onclick={() => setView('quiz')} role="tab" aria-selected={view === 'quiz'}>Quiz</button>
		<button class="tab" class:active={view === 'diff'} onclick={() => setView('diff')} role="tab" aria-selected={view === 'diff'}>Diff</button>
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

<main class="surface">
	{#if !init}
		<p class="loading">Loading…</p>
	{:else if init.base === null}
		<section class="empty-state">
			<div class="empty-icon" aria-hidden="true">
				<span class="codicon codicon-book"></span>
			</div>
			<h1 class="empty-title">No lecture authored yet</h1>
			<p class="empty-sub">
				Merge request <code>!{init.mr.id}</code> in <code>{init.mr.projectPath}</code>
				doesn't have a <code>.lectern</code> bundle on disk.
			</p>
			<div class="empty-cta">
				<p class="empty-hint">Ask Claude to write one:</p>
				<code class="empty-cmd">/lectern {init.mr.webUrl}</code>
			</div>
		</section>
	{:else if view === 'slides'}
		<Slides data={(init.slides as SlidesData | null) ?? null} />
	{:else if view === 'quiz'}
		<Quiz data={(init.quiz as never) ?? null} />
	{:else if view === 'diff'}
		<Diff diff={init.diff ?? null} />
	{:else if view === 'review'}
		<Review data={(init.review as never) ?? null} mr={init.mr} bundleBase={init.base} />
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
		display: block;
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
