<script lang="ts">
	interface Question {
		id: string;
		prompt: string;
		expectedLines?: Array<{ file: string; line: number }>;
	}

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
		question: Question;
		hunks: Hunk[];
		onsubmit: (marked: Array<{ file: string; line: number }>) => Promise<void>;
		onskip?: () => void;
		graded?: { rawScore?: number; verdict?: string; feedback?: string };
	}

	let { question, hunks, onsubmit, onskip, graded }: Props = $props();

	let marked = $state<Set<string>>(new Set());
	let submitting = $state(false);

	function key(file: string, line: number): string {
		return `${file}:${line}`;
	}

	function toggle(file: string, line: number): void {
		if (graded) return;
		const k = key(file, line);
		const next = new Set(marked);
		if (next.has(k)) next.delete(k);
		else next.add(k);
		marked = next;
	}

	async function submit(): Promise<void> {
		if (submitting || graded) return;
		submitting = true;
		try {
			const arr = [...marked].map((k) => {
				const [file, line] = k.split(':');
				return { file: file ?? '', line: Number(line) };
			});
			await onsubmit(arr);
		} finally {
			submitting = false;
		}
	}

	const expectedSet = $derived(
		new Set((question.expectedLines ?? []).map((l) => key(l.file, l.line)))
	);

	// Compute new-file line numbers, accounting for del lines (which don't exist in HEAD).
	type Numbered = { type: 'add' | 'del' | 'context'; content: string; newLine: number | null };
	function numberHunkLines(h: Hunk): Numbered[] {
		const out: Numbered[] = [];
		let n = h.newStart;
		for (const l of h.lines) {
			if (l.type === 'del') {
				out.push({ type: l.type, content: l.content, newLine: null });
			} else {
				out.push({ type: l.type, content: l.content, newLine: n });
				n += 1;
			}
		}
		return out;
	}

	function prefix(t: 'add' | 'del' | 'context'): string {
		return t === 'add' ? '+ ' : t === 'del' ? '- ' : '  ';
	}

	// Group consecutive hunks of the same file under one header for less visual noise.
	type FileGroup = { file: string; hunks: Hunk[] };
	const fileGroups = $derived.by((): FileGroup[] => {
		const groups: FileGroup[] = [];
		for (const h of hunks) {
			const last = groups[groups.length - 1];
			if (last && last.file === h.file) last.hunks.push(h);
			else groups.push({ file: h.file, hunks: [h] });
		}
		return groups;
	});

	function onKeydown(e: KeyboardEvent): void {
		if (graded) return;
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<section class="cl-section" aria-live="polite">
	<p class="cl-prompt">{question.prompt}</p>
	<p class="cl-hint">Click line numbers to mark them. ⌘/Ctrl + Enter to submit.</p>

	<div class="cl-diff">
		{#each fileGroups as g (g.file)}
			<header class="cl-file-header">{g.file}</header>
			{#each g.hunks as h (h.file + ':' + h.newStart)}
				<div class="cl-hunk-range">@@ -{h.oldStart} +{h.newStart} @@</div>
				{#if h.movedFrom}
					<div class="cl-moved-banner">
						<span class="cl-arrow">↳</span>
						<span>
							Relocated from <span class="cl-mono">{h.movedFrom.file}</span> · L{h.movedFrom.startLine}–{h.movedFrom.endLine}
						</span>
					</div>
				{/if}
				<ol>
					{#each numberHunkLines(h) as l, i (i)}
						{@const k = l.newLine !== null ? key(h.file, l.newLine) : null}
						{@const isMarked = k !== null && marked.has(k)}
						{@const isExpected = graded && k !== null && expectedSet.has(k)}
						{@const isCorrect = graded && isMarked && isExpected}
						{@const isWrong = graded && isMarked && !isExpected}
						{@const isMissed = graded && isExpected && !isMarked}
						<li
							class="cl-line"
							class:cl-add={l.type === 'add' && !h.movedFrom}
							class:cl-del={l.type === 'del'}
							class:cl-moved={l.type === 'add' && !!h.movedFrom}
							class:cl-marked={isMarked && !graded}
							class:cl-correct={isCorrect}
							class:cl-wrong={isWrong}
							class:cl-missed={isMissed}
						>
							<button
								type="button"
								onclick={() => l.newLine !== null && toggle(h.file, l.newLine)}
								disabled={Boolean(graded) || l.newLine === null}
								class="cl-gutter"
								aria-label={l.newLine !== null ? `Mark line ${l.newLine}` : 'Deleted line'}
							>
								{l.newLine ?? ''}
							</button>
							<pre class="cl-text">{prefix(l.type)}{l.content}</pre>
						</li>
					{/each}
				</ol>
			{/each}
		{/each}
	</div>

	{#if !graded}
		<div class="cl-actions">
			<span class="cl-count">{marked.size} marked</span>
			<div class="cl-buttons">
				{#if onskip}
					<button type="button" onclick={onskip} disabled={submitting} class="cl-btn cl-btn-ghost">
						Skip
					</button>
				{/if}
				<button
					type="button"
					onclick={submit}
					disabled={submitting}
					class="cl-btn cl-btn-primary"
				>
					{submitting ? 'Submitting…' : 'Submit'}
				</button>
			</div>
		</div>
	{:else}
		<div class="cl-verdict">
			<strong>
				Verdict: {graded.verdict ?? '—'}{typeof graded.rawScore === 'number'
					? ` (${graded.rawScore.toFixed(2)})`
					: ''}
			</strong>
			{#if graded.feedback}
				<p>{graded.feedback}</p>
			{/if}
		</div>
	{/if}
</section>

<style>
	.cl-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.cl-prompt {
		color: hsl(var(--text-primary));
		font-size: 13px;
		line-height: 1.5;
	}
	.cl-hint {
		font-size: 11px;
		color: hsl(var(--text-muted));
	}
	.cl-diff {
		overflow: hidden;
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 6px;
		background: hsl(var(--surface-0));
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.cl-file-header {
		padding: 6px 12px;
		background: hsl(var(--surface-2));
		color: hsl(var(--text-secondary));
		font-size: 11px;
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	.cl-hunk-range {
		padding: 2px 12px;
		background: hsl(var(--surface-1));
		color: hsl(var(--text-disabled));
		font-size: 10px;
		border-bottom: 1px solid hsl(var(--border-subtle));
	}
	.cl-moved-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 12px;
		font-size: 11px;
		color: hsl(var(--text-muted));
		background: hsl(var(--state-info-bg) / 0.4);
		border-left: 2px solid hsl(var(--state-info));
		border-bottom: 1px solid hsl(var(--border-subtle));
		font-family: var(--font-sans);
	}
	.cl-arrow {
		color: hsl(var(--state-info));
	}
	.cl-mono {
		font-family: var(--font-mono);
		color: hsl(var(--text-secondary));
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cl-line {
		display: flex;
		border-left: 2px solid transparent;
	}
	.cl-gutter {
		flex: 0 0 auto;
		width: 48px;
		padding: 1px 8px;
		text-align: right;
		color: hsl(var(--text-disabled));
		background: transparent;
		border: none;
		border-right: 1px solid hsl(var(--border-subtle));
		font-family: var(--font-mono);
		font-size: 11px;
		cursor: pointer;
		user-select: none;
	}
	.cl-gutter:hover:not(:disabled) {
		background: hsl(var(--surface-2));
		color: hsl(var(--text-primary));
	}
	.cl-gutter:disabled {
		cursor: default;
	}
	.cl-text {
		flex: 1;
		margin: 0;
		padding: 1px 10px;
		white-space: pre;
	}
	.cl-add {
		background: hsl(var(--state-success-bg));
		border-left-color: hsl(var(--state-success));
	}
	.cl-add .cl-text {
		color: hsl(var(--state-success));
	}
	.cl-del {
		background: hsl(var(--state-error-bg));
		border-left-color: hsl(var(--state-error));
	}
	.cl-del .cl-text {
		color: hsl(var(--state-error));
	}
	.cl-moved {
		background: hsl(var(--state-info-bg));
		border-left-color: hsl(var(--state-info));
	}
	.cl-moved .cl-text {
		color: hsl(var(--state-info));
	}
	.cl-marked {
		outline: 1px solid hsl(var(--accent));
		outline-offset: -1px;
	}
	.cl-marked .cl-gutter {
		background: hsl(var(--accent) / 0.2);
		color: hsl(var(--accent));
		font-weight: 600;
	}
	.cl-correct .cl-gutter {
		background: hsl(var(--state-success) / 0.25);
		color: hsl(var(--state-success));
	}
	.cl-wrong .cl-gutter {
		background: hsl(var(--state-error) / 0.25);
		color: hsl(var(--state-error));
	}
	.cl-missed .cl-gutter {
		background: hsl(var(--state-warning) / 0.25);
		color: hsl(var(--state-warning));
	}

	.cl-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.cl-count {
		font-size: 11px;
		color: hsl(var(--text-muted));
		font-family: var(--font-mono);
	}
	.cl-buttons {
		display: flex;
		gap: 8px;
	}
	.cl-btn {
		padding: 6px 14px;
		border-radius: 4px;
		font-size: 13px;
		font-weight: 500;
		border: 1px solid transparent;
		cursor: pointer;
	}
	.cl-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.cl-btn-ghost {
		background: transparent;
		border-color: hsl(var(--border-default));
		color: hsl(var(--text-secondary));
	}
	.cl-btn-ghost:hover:not(:disabled) {
		background: hsl(var(--surface-2));
	}
	.cl-btn-primary {
		background: hsl(var(--accent));
		color: hsl(var(--surface-0));
	}
	.cl-btn-primary:hover:not(:disabled) {
		background: hsl(var(--accent-hover));
	}
	.cl-verdict {
		padding: 10px 12px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 6px;
		font-size: 13px;
	}
	.cl-verdict p {
		margin-top: 6px;
		color: hsl(var(--text-secondary));
	}
</style>
