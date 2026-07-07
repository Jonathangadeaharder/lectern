<script lang="ts">
	import { highlightedLines } from './line-ranges';

	interface VsCodeApi {
		postMessage(msg: unknown): void;
	}

	// main.ts called acquireVsCodeApi() and stashed the handle on window.
	function getVscode(): VsCodeApi | null {
		return (
			(window as unknown as { __lecternVscode?: VsCodeApi }).__lecternVscode ??
			null
		);
	}

	let {
		text,
		highlightRangeStr = '',
		folds = [],
		expandedFolds = false,
		coverPath = '',
		isEmbed = true
	}: {
		text: string;
		highlightRangeStr?: string;
		folds?: number[];
		expandedFolds?: boolean;
		coverPath?: string;
		isEmbed?: boolean;
	} = $props();

	function revealLine(lineNum: number): void {
		const v = getVscode();
		if (!v) return;
		const msg: { type: string; line: number; path?: string } = {
			type: 'revealInEditor',
			line: lineNum
		};
		if (coverPath) msg.path = coverPath;
		v.postMessage(msg);
	}

	const foldSet = $derived(new Set(folds));
	const highlighted = $derived(highlightedLines(highlightRangeStr));

	interface LineItem {
		lineNum: number;
		text: string;
		isFoldStart: boolean;
		foldEnd: number;
		isHighlighted: boolean;
		isFirstHighlighted: boolean;
	}

	const lineItems = $derived.by(() => {
		const lines = text.split('\n');
		const items: LineItem[] = [];
		let i = 0;
		while (i < lines.length) {
			const lineNum = i + 1;
			if (!expandedFolds && foldSet.has(lineNum)) {
				// Collect the full contiguous fold span.
				let end = i;
				while (end + 1 < lines.length && foldSet.has(end + 2)) end++;
				items.push({
					lineNum,
					text: lines[i] ?? '',
					isFoldStart: true,
					foldEnd: end + 1,
					isHighlighted: false,
					isFirstHighlighted: false
				});
				i = end + 1;
			} else {
				const isHighlighted = highlighted.has(lineNum);
				const prevHighlighted = i > 0 && highlighted.has(lineNum - 1);
				items.push({
					lineNum,
					text: lines[i] ?? '',
					isFoldStart: false,
					foldEnd: lineNum,
					isHighlighted,
					isFirstHighlighted: isHighlighted && !prevHighlighted
				});
				i++;
			}
		}
		return items;
	});

	let expandedSpans = $state<Set<number>>(new Set());

	function toggleFold(lineNum: number) {
		const next = new Set(expandedSpans);
		if (next.has(lineNum)) next.delete(lineNum);
		else next.add(lineNum);
		expandedSpans = next;
	}
</script>

<div class="code-panel">
	{#if text.trim().length === 0}
		<p class="empty-hint">No code content for this slide.</p>
	{:else}
		<table class="code-table">
			<tbody>
				{#each lineItems as item (item.lineNum)}
					{#if item.isFoldStart && !expandedSpans.has(item.lineNum)}
						<tr class="fold-row">
							<td class="line-gutter" colspan="2">
								<button class="fold-btn" onclick={() => toggleFold(item.lineNum)}>
									Folded boilerplate ({item.foldEnd - item.lineNum + 1} lines) — click to expand
								</button>
							</td>
						</tr>
					{:else}
						<tr class:highlighted={item.isHighlighted} class:embed={isEmbed}>
							<td class="line-gutter">
								{#if item.isFirstHighlighted}
									<span class="focused-marker">▶</span>
								{/if}
								{#if isEmbed}
									<button
										type="button"
										class="line-jump"
										title="Reveal in editor"
										onclick={() => revealLine(item.lineNum)}
									>
										{item.lineNum}
									</button>
								{:else}
									{item.lineNum}
								{/if}
							</td>
							<td class="line-content">
								<code>{item.text}</code>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.code-panel {
		overflow-x: auto;
		overflow-y: auto;
		min-width: 0;
		height: 100%;
		background: hsl(var(--surface-0, 220 13% 8%));
		border-radius: 6px;
		font-family: var(--font-mono, ui-monospace);
		font-size: 12.5px;
		line-height: 1.55;
	}

	.empty-hint {
		font-style: italic;
		color: hsl(var(--text-disabled, 220 9% 45%));
		font-size: 12px;
		padding: 12px 16px;
	}

	.code-table {
		width: 100%;
		border-collapse: collapse;
	}

	tr {
		border-bottom: 1px solid transparent;
	}

	tr.highlighted {
		background: hsl(200 80% 50% / 0.12);
		border-left: 2px solid hsl(var(--accent, 200 90% 55%));
	}

	.line-gutter {
		user-select: none;
		color: hsl(var(--text-muted, 220 9% 45%));
		padding: 0 10px 0 8px;
		text-align: right;
		vertical-align: top;
		white-space: nowrap;
		font-size: 11px;
		min-width: 40px;
		position: relative;
	}

	.focused-marker {
		color: hsl(var(--accent, 200 90% 60%));
		font-size: 9px;
		position: absolute;
		left: 0;
		top: 3px;
	}

	.line-content {
		padding: 0 12px 0 4px;
		white-space: pre;
		overflow-x: visible;
		vertical-align: top;
		color: hsl(var(--text-default, 220 9% 90%));
	}

	.fold-row td {
		padding: 4px 8px;
	}

	.fold-btn {
		background: hsl(var(--surface-2, 220 13% 16%));
		border: 1px dashed hsl(var(--border-subtle, 220 13% 24%));
		border-radius: 4px;
		color: hsl(var(--text-muted, 220 9% 55%));
		font-size: 11px;
		font-family: var(--font-mono, ui-monospace);
		cursor: pointer;
		padding: 3px 10px;
		width: 100%;
		text-align: left;
	}

	.fold-btn:hover {
		background: hsl(var(--surface-3, 220 13% 20%));
		color: hsl(var(--text-default, 220 9% 80%));
	}

	.line-jump {
		background: none;
		border: 0;
		padding: 0;
		margin: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.line-jump:hover {
		color: hsl(var(--accent, 200 90% 60%));
		text-decoration: underline;
	}
</style>
