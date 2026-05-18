<script lang="ts">
	interface DiffLine {
		type: 'add' | 'del' | 'context';
		content: string;
	}

	interface MovedFrom {
		file: string;
		startLine: number;
		endLine: number;
		matchRatio: number;
	}

	interface Hunk {
		file: string;
		oldStart: number;
		newStart: number;
		lines: DiffLine[];
		movedFrom?: MovedFrom;
	}

	interface Props {
		hunks: Hunk[];
	}

	let { hunks }: Props = $props();

	function lineClass(type: 'add' | 'del' | 'context', moved: boolean): string {
		if (type === 'add') return moved ? 'line-moved' : 'line-add';
		if (type === 'del') return 'line-del';
		return '';
	}

	function prefix(t: 'add' | 'del' | 'context'): string {
		return t === 'add' ? '+ ' : t === 'del' ? '- ' : '  ';
	}
</script>

<div class="diff-root">
	{#each hunks as h, idx (idx)}
		<header class="hunk-header">
			{h.file} <span class="hunk-range">@@ -{h.oldStart} +{h.newStart} @@</span>
		</header>
		{#if h.movedFrom}
			<div
				class="moved-banner"
				title="Detected by line-shingle match ({Math.round(h.movedFrom.matchRatio * 100)}% overlap)"
			>
				<span class="moved-arrow" aria-hidden="true">↳</span>
				<span>
					Relocated from <span class="moved-file">{h.movedFrom.file}</span>
					<span class="moved-range">L{h.movedFrom.startLine}–{h.movedFrom.endLine}</span>
				</span>
				<span class="moved-hint">— existing code in new place</span>
			</div>
		{/if}
		<ol>
			{#each h.lines as l, i (i)}
				<li class="diff-line {lineClass(l.type, !!h.movedFrom)}">
					<span class="gutter">{h.newStart + i}</span>
					<pre class="line-text">{prefix(l.type)}{l.content}</pre>
				</li>
			{/each}
		</ol>
	{/each}
</div>

<style>
	.diff-root {
		overflow: auto;
		border-radius: 6px;
		border: 1px solid hsl(var(--border-subtle));
		background: hsl(var(--surface-0));
		font-family: var(--font-mono);
		font-size: 12px;
	}

	.hunk-header {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 4px 12px;
		border-bottom: 1px solid hsl(var(--border-subtle));
		background: hsl(var(--surface-1));
		color: hsl(var(--text-muted));
		font-size: 11px;
	}
	.hunk-range {
		color: hsl(var(--text-disabled));
	}

	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.diff-line {
		display: flex;
		border-left: 2px solid transparent;
	}
	.gutter {
		flex: 0 0 auto;
		width: 44px;
		padding: 1px 8px;
		text-align: right;
		color: hsl(var(--text-disabled));
		border-right: 1px solid hsl(var(--border-subtle));
		user-select: none;
	}
	.line-text {
		flex: 1;
		margin: 0;
		padding: 1px 10px;
		white-space: pre;
	}

	.line-add {
		background: hsl(var(--state-success-bg));
		border-left-color: hsl(var(--state-success));
	}
	.line-add .line-text {
		color: hsl(var(--state-success));
	}

	.line-del {
		background: hsl(var(--state-error-bg));
		border-left-color: hsl(var(--state-error));
	}
	.line-del .line-text {
		color: hsl(var(--state-error));
	}

	.line-moved {
		background: hsl(var(--state-info-bg));
		border-left-color: hsl(var(--state-info));
	}
	.line-moved .line-text {
		color: hsl(var(--state-info));
	}

	.moved-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		font-size: 11px;
		color: hsl(var(--text-muted));
		background: hsl(var(--state-info-bg) / 0.4);
		border-bottom: 1px solid hsl(var(--border-subtle));
		border-left: 2px solid hsl(var(--state-info));
		font-family: var(--font-sans);
	}
	.moved-arrow {
		font-size: 13px;
		color: hsl(var(--state-info));
	}
	.moved-file {
		color: hsl(var(--text-secondary));
		font-family: var(--font-mono);
	}
	.moved-range {
		color: hsl(var(--text-disabled));
		font-family: var(--font-mono);
	}
	.moved-hint {
		margin-left: auto;
		color: hsl(var(--text-disabled));
		font-style: italic;
	}
</style>
