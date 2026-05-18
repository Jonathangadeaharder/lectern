<script lang="ts">
	interface Question {
		id: string;
		prompt: string;
		originalCode: string;
		expectedCode?: string;
	}

	interface Props {
		question: Question;
		onsubmit: (code: string) => Promise<void>;
		onskip?: () => void;
		graded?: { rawScore?: number; verdict?: string; feedback?: string };
	}

	import { untrack } from 'svelte';

	let { question, onsubmit, onskip, graded }: Props = $props();

	let code = $state(untrack(() => question?.originalCode ?? ''));
	let submitting = $state(false);

	async function submit(): Promise<void> {
		if (!code.trim() || submitting || graded) return;
		submitting = true;
		try {
			await onsubmit(code);
		} finally {
			submitting = false;
		}
	}

	function handleKey(e: KeyboardEvent): void {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			submit();
		}
	}
</script>

<section class="flex flex-col gap-4" aria-live="polite">
	<p class="text-text-primary">{question.prompt}</p>
	<p class="text-xs text-text-muted">Edit the code below to fix the bug. ⌘↵ to submit.</p>

	<div class="flex flex-col gap-1">
		<textarea
			bind:value={code}
			onkeydown={handleKey}
			disabled={submitting || Boolean(graded)}
			rows="10"
			class="rounded-md border border-border bg-surface-1 p-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none disabled:opacity-70"
		></textarea>
	</div>

	{#if !graded}
		<div class="flex items-center justify-between">
			<div class="flex gap-2">
				<button
					type="button"
					onclick={submit}
					disabled={!code.trim() || submitting}
					class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface-0 hover:bg-accent-hover disabled:opacity-50"
				>
					{submitting ? 'Grading…' : 'Submit'}
				</button>
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
			</div>
		</div>
	{:else}
		<div
			class="rounded-md border p-3 text-sm
				{graded.verdict === 'pass' ? 'border-state-success bg-state-success-bg' : ''}
				{graded.verdict === 'fail' ? 'border-state-error bg-state-error-bg' : ''}
				{graded.verdict === 'borderline' || graded.verdict === 'review_needed' ? 'border-state-warning bg-state-warning-bg' : ''}"
		>
			<header class="mb-1 flex items-baseline justify-between">
				<strong class="text-text-primary"
					>Verdict: {graded.verdict ?? '—'}{typeof graded.rawScore === 'number'
						? ` (${graded.rawScore.toFixed(2)})`
						: ''}</strong
				>
			</header>
			{#if graded.feedback}
				<pre class="whitespace-pre-wrap text-text-secondary">{graded.feedback}</pre>
			{/if}
		</div>
	{/if}
</section>
