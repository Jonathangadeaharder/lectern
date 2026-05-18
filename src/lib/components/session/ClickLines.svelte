<script lang="ts">
	interface Question {
		id: string;
		prompt: string;
		expectedLines?: Array<{ file: string; line: number }>;
	}

	interface Hunk {
		file: string;
		oldStart: number;
		newStart: number;
		lines: Array<{ type: 'add' | 'del' | 'context'; content: string }>;
	}

	interface Props {
		question: Question;
		hunks: Hunk[];
		onsubmit: (marked: Array<{ file: string; line: number }>) => Promise<void>;
		graded?: { rawScore?: number; verdict?: string; feedback?: string };
	}

	let { question, hunks, onsubmit, graded }: Props = $props();

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
</script>

<section class="flex flex-col gap-4" aria-live="polite">
	<p class="text-text-primary">{question.prompt}</p>
	<p class="text-xs text-text-muted">
		Click lines that change behavior. ⌘↵ to submit.
	</p>

	<div class="overflow-hidden rounded-md border border-border bg-surface-0 font-mono text-xs">
		{#each hunks as h (h.file + ':' + h.newStart)}
			<header class="border-b border-border-subtle bg-surface-1 px-3 py-1 text-text-muted">
				{h.file}
			</header>
			<ol>
				{#each h.lines as l, idx (idx)}
					{@const lineNo = h.newStart + idx}
					{@const k = key(h.file, lineNo)}
					{@const isMarked = marked.has(k)}
					{@const isExpected = graded && expectedSet.has(k)}
					{@const isCorrect = graded && isMarked && isExpected}
					{@const isWrong = graded && isMarked && !isExpected}
					<li
						class="flex border-l-2
							{isCorrect ? 'border-state-success' : ''}
							{isWrong ? 'border-state-error' : ''}
							{!graded && isMarked ? 'border-accent' : ''}
							{!isMarked && !graded ? 'border-transparent' : ''}
							{graded && isExpected && !isMarked ? 'border-state-warning' : ''}"
					>
						<button
							type="button"
							onclick={() => toggle(h.file, lineNo)}
							disabled={Boolean(graded)}
							class="w-10 select-none border-r border-border-subtle px-2 py-0.5 text-right text-text-muted hover:bg-surface-2"
						>
							{lineNo}
						</button>
						<pre class="flex-1 whitespace-pre px-2 py-0.5 {l.type === 'add' ? 'bg-state-success-bg/20' : l.type === 'del' ? 'bg-state-error-bg/20' : ''}">{prefix(l.type)}{l.content}</pre>
					</li>
				{/each}
			</ol>
		{/each}
	</div>

	{#if !graded}
		<div class="flex items-center justify-between">
			<span class="text-xs text-text-muted">{marked.size} marked</span>
			<button
				type="button"
				onclick={submit}
				disabled={submitting}
				class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface-0 hover:bg-accent-hover disabled:opacity-50"
			>
				{submitting ? 'Submitting…' : 'Submit'}
			</button>
		</div>
	{:else}
		<div class="rounded-md border border-border-subtle bg-surface-1 p-3 text-sm">
			<strong class="text-text-primary"
				>Verdict: {graded.verdict ?? '—'}{typeof graded.rawScore === 'number'
					? ` (${graded.rawScore.toFixed(2)})`
					: ''}</strong
			>
			{#if graded.feedback}
				<p class="mt-1 text-text-secondary">{graded.feedback}</p>
			{/if}
		</div>
	{/if}
</section>

<script lang="ts" module>
	function prefix(t: 'add' | 'del' | 'context'): string {
		return t === 'add' ? '+ ' : t === 'del' ? '- ' : '  ';
	}
</script>
