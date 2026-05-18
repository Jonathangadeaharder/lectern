<script lang="ts">
	interface Question {
		id: string;
		prompt: string;
		correctAnswer: boolean;
		explanation?: string;
	}

	interface Props {
		question: Question;
		onsubmit: (answer: boolean) => Promise<void>;
		onskip?: () => void;
		graded?: { answer: boolean; verdict: string; explanation?: string };
	}

	let { question, onsubmit, onskip, graded }: Props = $props();

	let selected = $state<boolean | null>(null);
	let submitting = $state(false);

	async function submit(): Promise<void> {
		if (selected === null || submitting || graded) return;
		submitting = true;
		try {
			await onsubmit(selected);
		} finally {
			submitting = false;
		}
	}

	function handleKey(e: KeyboardEvent): void {
		if (graded) return;
		if (e.key === 't' || e.key === 'T') {
			selected = true;
		} else if (e.key === 'f' || e.key === 'F') {
			selected = false;
		} else if (e.key === 'Enter' && selected !== null) {
			e.preventDefault();
			submit();
		}
	}
</script>

<svelte:window onkeydown={handleKey} />

<section class="flex flex-col gap-4" aria-live="polite">
	<p class="text-text-primary">{question.prompt}</p>

	<div class="flex gap-3">
		<button
			type="button"
			onclick={() => (graded ? null : (selected = true))}
			disabled={Boolean(graded)}
			aria-pressed={selected === true}
			class="flex flex-1 items-center gap-2 rounded-md border p-3 text-left transition
				{graded && question.correctAnswer === true ? 'border-state-success bg-state-success-bg' : ''}
				{graded && selected === true && question.correctAnswer !== true ? 'border-state-error bg-state-error-bg' : ''}
				{!graded && selected === true ? 'border-accent bg-surface-2' : ''}
				{!graded && selected !== true ? 'border-border hover:bg-surface-2' : ''}
				{graded && selected !== true && question.correctAnswer !== true ? 'border-border-subtle opacity-50' : ''}"
		>
			<kbd class="rounded bg-surface-3 px-1.5 py-0.5 text-xs text-text-secondary">T</kbd>
			<span class="text-text-primary">True</span>
		</button>
		<button
			type="button"
			onclick={() => (graded ? null : (selected = false))}
			disabled={Boolean(graded)}
			aria-pressed={selected === false}
			class="flex flex-1 items-center gap-2 rounded-md border p-3 text-left transition
				{graded && question.correctAnswer === false ? 'border-state-success bg-state-success-bg' : ''}
				{graded && selected === false && question.correctAnswer !== false ? 'border-state-error bg-state-error-bg' : ''}
				{!graded && selected === false ? 'border-accent bg-surface-2' : ''}
				{!graded && selected !== false ? 'border-border hover:bg-surface-2' : ''}
				{graded && selected !== false && question.correctAnswer !== false ? 'border-border-subtle opacity-50' : ''}"
		>
			<kbd class="rounded bg-surface-3 px-1.5 py-0.5 text-xs text-text-secondary">F</kbd>
			<span class="text-text-primary">False</span>
		</button>
	</div>

	{#if !graded}
		<div class="flex items-center justify-between">
			<p class="text-xs text-text-muted">Press T or F to select. Enter to submit.</p>
			<div class="flex gap-2">
				{#if onskip}
					<button
						type="button"
						onclick={onskip}
						disabled={submitting}
						class="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 disabled:opacity-50"
					>
						Skip
					</button>
				{/if}
				<button
					type="button"
					onclick={submit}
					disabled={selected === null || submitting}
					class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface-0 hover:bg-accent-hover disabled:opacity-50"
				>
					{submitting ? 'Submitting…' : 'Submit'}
				</button>
			</div>
		</div>
	{:else}
		<p class="text-sm text-text-secondary">{graded.explanation ?? ''}</p>
	{/if}
</section>
