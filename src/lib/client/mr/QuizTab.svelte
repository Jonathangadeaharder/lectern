<script lang="ts">
	interface Question {
		id?: string;
		prompt?: string;
		format?: string;
	}

	interface Props {
		questions: Question[] | null;
		mrWebUrl: string;
	}

	let { questions, mrWebUrl }: Props = $props();
</script>

<section class="quiz-tab" data-testid="quiz-tab">
	{#if !questions || questions.length === 0}
		<div class="empty">
			<h2>No quiz authored yet</h2>
			<p>
				Ask Claude to write quiz questions for this MR:
			</p>
			<code class="cmd">/lectern {mrWebUrl}</code>
			<p class="hint">Quizzes are optional. Diff and Review work without them.</p>
		</div>
	{:else}
		<ol class="questions">
			{#each questions as q, i (q.id ?? i)}
				<li class="question">
					<div class="q-num">Q{i + 1}</div>
					<div class="q-body">
						<p class="prompt">{q.prompt ?? '(no prompt)'}</p>
						{#if q.format}
							<span class="fmt">{q.format}</span>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.quiz-tab {
		overflow-y: auto;
		padding: 20px 24px;
		background: hsl(var(--surface-0));
		color: hsl(var(--text-primary));
	}
	.empty {
		max-width: 560px;
		margin: 8vh auto 0;
		display: grid;
		gap: 10px;
		text-align: center;
	}
	.empty h2 {
		font-size: 18px;
		margin: 0;
	}
	.empty p {
		margin: 0;
		color: hsl(var(--text-secondary));
	}
	.empty .hint {
		font-size: 12px;
		color: hsl(var(--text-muted));
	}
	.cmd {
		display: inline-block;
		padding: 8px 14px;
		background: hsl(var(--surface-2));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 4px;
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		font-size: 12px;
	}
	.questions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.question {
		display: grid;
		grid-template-columns: 48px 1fr;
		gap: 14px;
		padding: 14px 18px;
		background: hsl(var(--surface-1));
		border: 1px solid hsl(var(--border-subtle));
		border-radius: 6px;
	}
	.q-num {
		font-family: 'Geist Mono Variable', ui-monospace, monospace;
		color: hsl(var(--text-muted));
	}
	.prompt {
		margin: 0 0 6px;
		font-size: 13px;
	}
	.fmt {
		font-size: 10px;
		text-transform: uppercase;
		background: hsl(var(--surface-3));
		color: hsl(var(--text-muted));
		padding: 2px 6px;
		border-radius: 4px;
	}
</style>
