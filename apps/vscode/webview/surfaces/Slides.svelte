<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import BulletList, {
		type Bullet
	} from '../components/presentation/BulletList.svelte';
	import CodePanel from '../components/presentation/CodePanel.svelte';
	import MermaidDiagram from '../components/presentation/MermaidDiagram.svelte';
	import { splitSlideBody } from '../components/presentation/slideContent';

	interface Cover {
		path: string;
	}
	interface Slide {
		position: number;
		title: string;
		body: string;
		covers: Cover[];
		bullets: Bullet[];
		folds: number[];
		kind?: string;
		severity?: string;
		callout?: string;
	}
	interface SlidesPayload {
		meta?: { title?: string };
		slides: Slide[];
	}

	let { data }: { data: SlidesPayload | null } = $props();

	let index = $state(0);
	let activeBullet = $state(0);

	const slides = $derived(data?.slides ?? []);
	const current = $derived<Slide | null>(slides[index] ?? null);

	// Peel off an optional `## Cheatsheet` (or `# Cheatsheet`) section at the
	// tail of the body. Its content renders as a collapsible drawer below the
	// main slide so readers who need term-by-term detail can expand it,
	// without cluttering the primary slide surface.
	function splitCheatsheet(body: string): { main: string; cheatsheet: string } {
		if (!body) return { main: '', cheatsheet: '' };
		const m = body.match(/\n#{1,3}\s*Cheatsheet\s*\n([\s\S]*)$/i);
		if (!m) return { main: body, cheatsheet: '' };
		return {
			main: body.slice(0, m.index ?? 0),
			cheatsheet: (m[1] ?? '').trim()
		};
	}
	const parts = $derived(current ? splitCheatsheet(current.body) : { main: '', cheatsheet: '' });
	const split = $derived(current ? splitSlideBody(parts.main) : null);

	$effect(() => {
		// Clamp index when the slide pool shrinks (e.g. live reload).
		if (index > slides.length - 1) index = Math.max(0, slides.length - 1);
		activeBullet = 0;
	});

	marked.setOptions({ gfm: true, breaks: true });
	function renderMd(src: string): string {
		if (!src) return '';
		return DOMPurify.sanitize(marked.parse(src) as string);
	}

	function prev(): void {
		if (index > 0) index -= 1;
	}
	function next(): void {
		if (index < slides.length - 1) index += 1;
	}

	function severityClass(s: string | undefined): string {
		if (s === 'critical') return 'sev sev-critical';
		if (s === 'attention') return 'sev sev-attention';
		return 'sev sev-info';
	}
</script>

{#if slides.length === 0}
	<div class="empty-shell">
		<p class="empty">No slides authored yet.</p>
	</div>
{:else if current && split}
	<div class="slide-view">
		<article class="slide-render {severityClass(current.severity)}">
			{#if current.kind || split.heading}
				<div class="slide-eyebrow">
					{#if current.kind}
						<span class="slide-kind kind-{current.kind}">{String(current.kind).replace(/_/g, ' ')}</span>
					{/if}
					<span class="slide-counter">Slide {index + 1} / {slides.length}</span>
				</div>
			{/if}

			{#if current.callout}
				<h1 class="slide-h1">{current.callout}</h1>
			{:else if split.heading}
				<h1 class="slide-h1">{split.heading}</h1>
			{/if}

			{#if split.intro}
				<div class="slide-prose">{@html renderMd(split.intro)}</div>
			{/if}

			{#if split.codeLang === 'mermaid' && split.codeSnippet}
				<div class="code-pane"><MermaidDiagram code={split.codeSnippet} /></div>
			{:else if split.codeSnippet}
				<div class="code-pane"><CodePanel
					text={split.codeSnippet}
					highlightRangeStr={(current.bullets ?? [])[activeBullet]?.highlightLines ?? ''}
					folds={current.folds ?? []}
					coverPath={(current.covers ?? [])[0]?.path ?? ''}
				/></div>
			{/if}

			{#if (current.bullets ?? []).length > 0}
				<div class="bullets-strip">
					<BulletList
						bullets={(current.bullets ?? [])}
						activeIndex={activeBullet}
						onSelect={(i) => (activeBullet = i)}
					/>
				</div>
			{/if}

			{#if split.outro}
				<div class="slide-prose">{@html renderMd(split.outro)}</div>
			{/if}
		</article>

		{#if parts.cheatsheet}
			<details class="slide-cheatsheet">
				<summary>
					<span class="cs-icon codicon codicon-book" aria-hidden="true"></span>
					Cheatsheet
					<span class="cs-hint">— concepts and identifiers used above</span>
				</summary>
				<div class="cs-body slide-prose">{@html renderMd(parts.cheatsheet)}</div>
			</details>
		{/if}

		<nav class="slide-nav">
			<button class="nav-btn" disabled={index === 0} onclick={prev} aria-label="Previous slide">
				<span class="codicon codicon-arrow-left"></span>
			</button>
			<button class="nav-btn" disabled={index >= slides.length - 1} onclick={next} aria-label="Next slide">
				<span class="codicon codicon-arrow-right"></span>
			</button>
		</nav>
	</div>
{/if}

<style>
	.empty-shell {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 40vh;
	}
	.empty {
		color: var(--vscode-descriptionForeground);
		font-style: italic;
		text-align: center;
	}

	/* Cards hug the top of the surface — no vertical centering, no wasted
	   space above the first slide. Matches the web app's presentation view. */
	.slide-view {
		max-width: 980px;
		margin: 0 auto;
		padding: 20px 24px 8px;
	}

	.slide-render {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 22px 28px;
		border-left: 4px solid var(--vscode-panel-border, transparent);
		background: var(--vscode-editor-background);
		border-radius: 6px;
		border: 1px solid var(--vscode-panel-border, transparent);
	}
	.sev-critical { border-left: 4px solid var(--vscode-errorForeground, hsl(0 65% 58%)); }
	.sev-attention { border-left: 4px solid var(--vscode-editorWarning-foreground, hsl(35 80% 55%)); }
	.sev-info { border-left: 4px solid var(--vscode-panel-border, transparent); }

	.slide-eyebrow {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--vscode-descriptionForeground);
		font-family: var(--vscode-editor-font-family, monospace);
	}
	.slide-kind {
		padding: 2px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--vscode-textLink-foreground) 20%, transparent);
		color: var(--vscode-textLink-foreground);
		font-weight: 500;
		letter-spacing: 0.04em;
	}
	.slide-kind.kind-risk,
	.slide-kind.kind-open_question {
		background: color-mix(in srgb, var(--vscode-editorWarning-foreground, orange) 20%, transparent);
		color: var(--vscode-editorWarning-foreground, orange);
	}
	.slide-kind.kind-appendix {
		background: var(--vscode-badge-background);
		color: var(--vscode-badge-foreground);
	}
	.slide-counter {
		margin-left: auto;
	}

	.slide-h1 {
		margin: 4px 0 0;
		font-size: 24px;
		font-weight: 600;
		line-height: 1.25;
		letter-spacing: -0.015em;
		color: var(--vscode-foreground);
		max-width: 46ch;
	}

	.slide-prose {
		font-size: 14.5px;
		line-height: 1.6;
		color: var(--vscode-foreground);
	}
	.slide-prose :global(p) { margin: 0 0 10px; }
	.slide-prose :global(p:last-child) { margin-bottom: 0; }
	.slide-prose :global(strong) { font-weight: 600; }
	.slide-prose :global(em) {
		color: var(--vscode-descriptionForeground);
		font-style: italic;
	}
	.slide-prose :global(code) {
		font-family: var(--vscode-editor-font-family, monospace);
		font-size: 12.5px;
		padding: 1px 5px;
		background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
		border-radius: 3px;
	}
	.slide-prose :global(a) { color: var(--vscode-textLink-foreground); text-decoration: none; }
	.slide-prose :global(a:hover) { text-decoration: underline; }
	.slide-prose :global(h2) {
		margin: 8px 0 6px;
		font-size: 17px;
		font-weight: 600;
	}
	.slide-prose :global(h3) {
		margin: 6px 0 4px;
		font-size: 14px;
		font-weight: 600;
	}
	.slide-prose :global(ul) { margin: 4px 0 10px; padding-left: 20px; }
	.slide-prose :global(li) { margin: 2px 0; }

	.code-pane {
		overflow: auto;
		border-radius: 4px;
		border: 1px solid var(--vscode-panel-border, transparent);
		background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
	}

	.bullets-strip {
		margin-top: 6px;
		padding-top: 12px;
		border-top: 1px solid var(--vscode-panel-border, transparent);
	}

	.slide-nav {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 4px 0;
	}
	.nav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 26px;
		border: 1px solid var(--vscode-panel-border, transparent);
		border-radius: 3px;
		background: var(--vscode-button-secondaryBackground, transparent);
		color: var(--vscode-foreground);
		cursor: pointer;
	}
	.nav-btn:hover:not(:disabled) {
		background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
	}
	.nav-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.codicon { font-size: 15px; }

	.slide-cheatsheet {
		margin-top: 12px;
		border: 1px solid var(--vscode-panel-border, transparent);
		border-radius: 4px;
		background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
	}
	.slide-cheatsheet[open] { padding-bottom: 4px; }
	.slide-cheatsheet summary {
		padding: 8px 14px;
		font-size: 12px;
		font-weight: 500;
		color: var(--vscode-foreground);
		cursor: pointer;
		user-select: none;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.slide-cheatsheet summary:hover {
		background: var(--vscode-list-hoverBackground);
	}
	.cs-icon { color: var(--vscode-textLink-foreground); }
	.cs-hint {
		font-weight: 400;
		font-size: 11px;
		color: var(--vscode-descriptionForeground);
		margin-left: 4px;
	}
	.cs-body {
		padding: 12px 18px 4px;
		border-top: 1px solid var(--vscode-panel-border, transparent);
	}
</style>
