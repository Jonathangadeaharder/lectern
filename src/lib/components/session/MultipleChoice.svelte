<script lang="ts">
	interface Option {
		id: string;
		text: string;
		correct: boolean;
		explanation?: string;
	}

	interface Question {
		id: string;
		prompt: string;
		options: Option[];
	}

	interface Props {
		question: Question;
		onsubmit: (selectedOptionId: string) => Promise<void>;
		graded?: { selectedOptionId: string; verdict: string; correctOptionId: string; explanation?: string };
	}

	let { question, onsubmit, graded }: Props = $props();

	let selected = $state<string | null>(null);
	$effect(() => {
		if (graded?.selectedOptionId) selected = graded.selectedOptionId;
	});
	let submitting = $state(false);

	async function submit(): Promise<void> {
		if (!selected || submitting || graded) return;
		submitting = true;
		try {
			await onsubmit(selected);
		} finally {
			submitting = false;
		}
	}

	function selectByDigit(n: number): void {
		const opt = question.options[n - 1];
		if (opt) selected = opt.id;
	}

	function handleKey(e: KeyboardEvent): void {
		if (graded) return;
		if (e.key >= '1' && e.key <= '9') {
			const n = Number(e.key);
			if (n <= question.options.length) selectByDigit(n);
		} else if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey)) || (e.key === 'Enter' && selected)) {
			e.preventDefault();
			submit();
		}
	}
</script>

<svelte:window onkeydown={handleKey} />

<section class="flex flex-col gap-4" aria-live="polite">
	<p class="text-text-primary">{question.prompt}</p>

	<ol class="flex flex-col gap-2">
		{#each question.options as opt, i (opt.id)}
			{@const isSelected = selected === opt.id}
			{@const isCorrect = graded && opt.id === graded.correctOptionId}
			{@const isWrong = graded && isSelected && !isCorrect}
			<li>
				<button
					type="button"
					onclick={() => (graded ? null : (selected = opt.id))}
					disabled={Boolean(graded)}
					aria-pressed={isSelected}
					class="flex w-full items-start gap-3 rounded-md border p-3 text-left transition
						{isCorrect ? 'border-state-success bg-state-success-bg' : ''}
						{isWrong ? 'border-state-error bg-state-error-bg' : ''}
						{!graded && isSelected ? 'border-accent bg-surface-2' : ''}
						{!graded && !isSelected ? 'border-border hover:bg-surface-2' : ''}
						{graded && !isCorrect && !isWrong ? 'border-border-subtle opacity-50' : ''}"
				>
					<kbd class="rounded bg-surface-3 px-1.5 py-0.5 text-xs text-text-secondary"
						>{i + 1}</kbd
					>
					<span class="flex-1 text-text-primary">{opt.text}</span>
				</button>
				{#if graded && (isCorrect || isWrong) && opt.explanation}
					<p class="mt-1 pl-9 text-xs text-text-secondary">{opt.explanation}</p>
				{/if}
			</li>
		{/each}
	</ol>

	{#if !graded}
		<div class="flex items-center justify-between">
			<p class="text-xs text-text-muted">Press 1–{question.options.length} to select. ⌘↵ to submit.</p>
			<button
				type="button"
				onclick={submit}
				disabled={!selected || submitting}
				class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface-0 hover:bg-accent-hover disabled:opacity-50"
			>
				{submitting ? 'Submitting…' : 'Submit'}
			</button>
		</div>
	{:else}
		<p class="text-sm text-text-secondary">{graded.explanation ?? ''}</p>
	{/if}
</section>
