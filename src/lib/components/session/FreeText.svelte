<script lang="ts">
	interface Question {
		id: string;
		prompt: string;
	}

	interface PartialGrade {
		requiredResults?: Array<{ id: string; met: 'yes' | 'partial' | 'no'; justification: string }>;
		feedback?: string;
		rawScore?: number;
		verdict?: 'pass' | 'fail' | 'borderline' | 'review_needed' | 'skipped';
	}

	interface Props {
		question: Question;
		sessionId: string;
		graded?: PartialGrade;
		onskip?: () => void;
	}

	let { question, sessionId, graded, onskip }: Props = $props();

	let answer = $state('');
	let submitting = $state(false);
	let live = $state<PartialGrade | null>(null);
	let final = $state<PartialGrade | null>(null);
	$effect(() => {
		if (graded) final = graded;
	});

	const wordCount = $derived(answer.trim().split(/\s+/).filter(Boolean).length);

	async function submit(): Promise<void> {
		if (!answer.trim() || submitting || final) return;
		submitting = true;
		live = {};
		try {
			const res = await fetch(`/api/sessions/${sessionId}/answers`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					format: 'free_text',
					questionId: question.id,
					answer,
					stream: true
				})
			});
			if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buf = '';
			let currentEvent = 'partial';

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				const events = buf.split('\n\n');
				buf = events.pop() ?? '';
				for (const block of events) {
					const lines = block.split('\n');
					for (const line of lines) {
						if (line.startsWith('event:')) currentEvent = line.slice(6).trim();
						else if (line.startsWith('data:')) {
							try {
								const data = JSON.parse(line.slice(5).trim());
								if (currentEvent === 'partial') live = data;
								else if (currentEvent === 'done') final = data;
								else if (currentEvent === 'error') {
									final = {
										verdict: 'borderline',
										feedback: data.message ?? 'Grading failed.'
									};
								}
							} catch {
								// ignore parse errors mid-stream
							}
						}
					}
				}
			}
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

	<div class="flex flex-col gap-1">
		<textarea
			bind:value={answer}
			onkeydown={handleKey}
			disabled={submitting || Boolean(final)}
			placeholder="2–3 sentences."
			rows="5"
			class="rounded-md border border-border bg-surface-1 p-3 font-sans text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none disabled:opacity-70"
		></textarea>
		<p class="text-right text-xs text-text-muted">{wordCount} word{wordCount === 1 ? '' : 's'}</p>
	</div>

	{#if !final}
		<div class="flex items-center justify-between">
			<p class="text-xs text-text-muted">⌘↵ to submit.</p>
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
					disabled={!answer.trim() || submitting}
					class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface-0 hover:bg-accent-hover disabled:opacity-50"
				>
					{submitting ? 'Grading…' : 'Submit'}
				</button>
			</div>
		</div>
	{/if}

	{#if live && submitting && !final}
		<div class="rounded-md border border-border-subtle bg-surface-1 p-3 text-sm">
			{#if live.requiredResults?.length}
				<ul class="flex flex-col gap-1">
					{#each live.requiredResults as r (r.id)}
						<li class="flex gap-2 text-xs">
							<span class="font-mono text-text-muted">{symbolFor(r.met)}</span>
							<span class="text-text-secondary">{r.justification}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if final}
		<div
			class="rounded-md border p-3 text-sm
				{final.verdict === 'pass' ? 'border-state-success bg-state-success-bg' : ''}
				{final.verdict === 'fail' ? 'border-state-error bg-state-error-bg' : ''}
				{final.verdict === 'borderline' || final.verdict === 'review_needed' ? 'border-state-warning bg-state-warning-bg' : ''}"
		>
			<header class="mb-1 flex items-baseline justify-between">
				<strong class="text-text-primary"
					>Verdict: {final.verdict ?? '—'}{typeof final.rawScore === 'number'
						? ` (${final.rawScore.toFixed(2)})`
						: ''}</strong
				>
			</header>
			{#if final.feedback}
				<p class="text-text-secondary">{final.feedback}</p>
			{/if}
			{#if final.requiredResults?.length}
				<ul class="mt-2 flex flex-col gap-1">
					{#each final.requiredResults as r (r.id)}
						<li class="flex gap-2 text-xs">
							<span class="font-mono text-text-muted">{symbolFor(r.met)}</span>
							<span class="text-text-secondary">{r.justification}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<script lang="ts" module>
	function symbolFor(met: 'yes' | 'partial' | 'no'): string {
		return met === 'yes' ? '✓' : met === 'partial' ? '~' : '✗';
	}
</script>
